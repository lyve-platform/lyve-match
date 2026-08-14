# LYVE — Phase 3 Security Audit (Messaging, Conversations, Realtime, Reports)

Status: **complete**. All CRITICAL and HIGH findings fixed.
Automated suite: `bun run test:security` → **288 / 288 passing** (Phase 1: 43, Phase 2: 120 + 29, Phase 3: 96).

Every assertion runs against the live database through the public Data API with
real user sessions. The service role is used only to create/destroy throwaway
accounts and to observe ground truth. No test drives the UI.

---

## 1. Findings and fixes

### HIGH-1 — Messaging was fully broken by a missing function privilege *(fixed)*
The Phase 3 RLS policies call `can_read_conversation`, `can_send_message` and
`is_blocked_pair`. Policy expressions are evaluated with the **caller's**
privileges, and Phase 2 hardening had revoked `EXECUTE` from `authenticated`.
Result: every send and every conversation read failed with
`permission denied for function can_send_message`.

Fix: granted `EXECUTE` on the four messaging helper predicates to
`authenticated`, and tightened `is_blocked_pair` so it is **self-scoped** — when
called by a signed-in member for a pair they are not part of, it returns
`false` instead of revealing whether two strangers blocked each other. All
legitimate call sites (RLS, discovery, interaction guards) always pass the
caller as one side of the pair, so behaviour is unchanged.

### HIGH-2 — Latent full-table grants on the Phase 3 tables *(fixed)*
`conversations`, `conversation_members`, `messages`, `message_reads` and
`message_reports` were created with `ALL` privileges for both `anon` and
`authenticated` (including `DELETE`, `TRUNCATE`, `TRIGGER`, `REFERENCES`). RLS
blocked exploitation, but this is a single-policy-mistake away from exposure.

Fix: revoked everything from `anon` and `authenticated`, then re-granted the
minimum: `SELECT` on conversations and members; `SELECT, INSERT, UPDATE` on
messages (update is withdraw-only, enforced by trigger); `SELECT, INSERT` on
read receipts and message reports. `anon` now has **no** privilege on any
messaging table.

### Accepted warnings
The database linter flags nine `SECURITY DEFINER` functions as callable by
signed-in users: the product RPCs (`discover_candidates`, `likes_received`,
`my_matches`, `my_conversations`, `mark_conversation_read`) and the four RLS
predicates above. All of them derive identity from `auth.uid()` internally,
raise on an anonymous caller, and are self-scoped. They must be executable by
members or the feature and its RLS cannot work. Accepted by design.

---

## 2. Coverage — what the Phase 3 suite proves

**Provisioning (8)** — a mutual match creates exactly one conversation with
exactly the two matched members; clients cannot create conversations, enroll
themselves, remove the other member, rewrite participants, or delete a thread.

**Membership and visibility (7)** — members read only their own conversation;
non-members cannot read the row, the membership list, the thread, or a message
by guessed id; signed-out visitors can neither read nor send.

**Message integrity (12)** — `sender_id` is server-assigned, so impersonation is
impossible; blank and >4000-character bodies are rejected while exactly 4000 is
accepted; client-supplied `created_at`, `deleted_at` and moderation fields are
stripped server-side.

**Immutability and withdrawal (8)** — a sent message can never be edited, only
withdrawn, and only by its sender; withdrawal scrubs the body in the database
rather than hiding it; a withdrawn message cannot be revived; hard delete is
impossible from the client.

**Read receipts (7)** — receipts can only be created for yourself, only in a
conversation you belong to, and only for messages you did not send; they are
immutable and undeletable; the RPC rejects non-members, blocked members and
anonymous callers.

**Inbox RPC (8)** — scoped strictly to the caller; the payload carries no email,
coordinates, date of birth or moderation state; forged bearer tokens are
rejected.

**Unmatch (6)** — sending stops instantly for both sides, history stays readable
to both, and the inbox reports the thread as read-only.

**Blocking (9)** — after a block neither side can send or read the thread, the
conversation disappears from the inbox, the read RPC refuses, and the
underlying match is moved to `blocked`.

**Message reports (12)** — reportable only for a message you actually received,
in a conversation you can see, in your own name, once per message, with a
capped description; reports are append-only, invisible to the reported member,
and unreadable by anyone else.

**Realtime (3)** — a non-member subscribed to `messages` receives nothing; a
signed-out subscriber receives only an empty `Error 401: Unauthorized` envelope
with no row data. Typing indicators are ephemeral broadcast only and are never
persisted.

**Pagination and enumeration (4)** — pages are bounded at 30 (max 50); an
unbounded query still returns only the caller's own conversation; unknown
conversation ids return empty rather than an error hint.

**Projection, errors, moderation (9)** — the client projection is a strict
allowlist that drops moderation state and never renders a withdrawn body;
duplicate realtime deliveries de-duplicate; error messages leak no schema
internals; the heuristic screener flags scam/threat categories deterministically
while never blocking delivery and never claiming to be AI.

**Privilege hygiene (3)** — forged bearer tokens cannot send; malformed RPC input
is rejected cleanly; a member cannot soft-delete another member's profile to
silence them.

---

## 3. Residual risks / Phase 4 candidates

- **No rate limiting on message sends.** A scripted client can flood a matched
  conversation. Belongs with the platform-level abuse controls in Phase 4.
- **No human moderation queue.** `moderation_status` is populated as
  `unreviewed` and never acted on; there is no admin surface yet.
- **Message bodies are stored in plaintext** at rest (database-level encryption
  only). End-to-end encryption is explicitly out of scope for the MVP.
- **Read receipts are not yet gated on the privacy setting** at the database
  level; `show_read_receipts` is honoured in the UI only.
