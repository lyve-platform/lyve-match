# LYVE — Personas, User Stories, Journeys

## 1. Personas
**Amina, 27, Dubai — Marriage-minded.** Wants intent clarity and privacy from her
community. Needs incognito, verified badges, no exposure of contact details.

**Daniel, 33, London — Serious relationship.** Burned out on swipe apps. Wants depth,
compatibility reasons, fewer but better profiles.

**Leila, 22, Casablanca — New connections.** Social, exploratory, mobile-only, low data.
Wants fun, low pressure, strong blocking tools.

**Marco, 41, São Paulo — Open to possibilities.** Divorced, cautious, values safety
signals and slow pacing.

**Nadia, 30 — Moderator (internal).** Needs a fast queue, context, and reversible actions.

**Omar — Admin (internal).** Needs metrics, weight tuning, payments oversight, audit trail.

## 2. User stories (MVP, by epic)

### Auth & age
- As a visitor I must confirm my date of birth so under-18s cannot register.
- As a user I can sign up with email or phone and verify by OTP.
- As a user I can recover access securely without exposing my account to takeover.

### Onboarding
- As a new user I complete a 14-step guided setup with visible progress.
- As a new user I can skip optional steps and finish them later from my profile.
- As a new user I select one or more relationship intentions.

### Profile
- As a user I upload up to 6 photos and one optional short video.
- As a user I can get AI help drafting or improving my bio, and always edit the result.
- As a user my email, phone, address, GPS and payment data are never shown to others.

### Discovery
- As a user I see profiles filtered by my preferences and ranked by compatibility.
- As a user I can like, pass, super like, open details, save, report, or block.
- As a user I do not repeatedly see the same profiles.

### Matching
- As a user I see a compatibility percentage plus plain-language reasons.
- As a user a mutual like creates a match and opens a conversation.

### Chat
- As a user I exchange text, emoji, and images in real time.
- As a user I see typing indicators, read status (if enabled), and unread counts.
- As a user I receive a safety warning when a message shows scam or money-request patterns.
- As a user I can report a message, unmatch, block, or delete the conversation.

### Safety
- As a user I can report with a clear category and optional evidence.
- As a restricted user I can appeal a decision and see its status.

### Premium / monetization
- As a free user I have a daily like limit and basic messaging.
- As a Premium user I get unlimited likes, see who liked me, advanced filters,
  incognito, extra Super Likes, and Boosts.
- As a user I can cancel a subscription and see my billing status.

### Admin
- As a moderator I work a prioritized queue with AI signals and take reversible actions.
- As an admin I tune compatibility weights without a code deploy.
- As a super admin I review audit logs of all sensitive actions.

## 3. Primary journeys

**New user → first match**
Landing → Sign Up → Age Gate → OTP → Onboarding (14 steps) → Discover →
Like → Mutual Like → Match modal → Conversation → Ongoing chat.

**Safety incident**
Chat → suspicious message → inline safety banner → Report (category) → auto-block option →
case created → AI triage → moderator review → action → notification to reporter →
appeal path for the actioned account.

**Upgrade**
Hit like limit → Premium screen (configurable plans) → checkout via provider →
webhook confirms → entitlements activated → confirmation + receipt notification.

**Verification**
Profile → Get Verified → Basic (email/phone) → optional IDV session with external
provider (only if configured) → status pending → badge on approval; documents never
visible to other users.

**Account deletion**
Settings → Delete Account → reason + confirmation → soft delete + immediate de-listing →
retention window → hard purge per policy.
