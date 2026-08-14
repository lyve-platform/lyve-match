# LYVE — Matching & AI Architecture

## 1. Compatibility Engine
Pure, deterministic scoring function; weights loaded from `matching_weights`
(admin-editable, never hard-coded).

Default weights:
| Factor | Key | Default |
|---|---|---|
| Relationship intent | `intent` | 0.25 |
| Shared interests | `interests` | 0.15 |
| Lifestyle compatibility | `lifestyle` | 0.15 |
| Personality compatibility | `personality` | 0.15 |
| Age preference fit | `age` | 0.10 |
| Location proximity | `location` | 0.10 |
| Relationship preferences | `preferences` | 0.10 |

`score = round(100 * Σ(weight_i × subscore_i) / Σ weight_i)` over factors with data.
Missing data is excluded from the denominator rather than scored as zero.

Sub-scores (0..1):
- **intent** — Jaccard overlap of intent sets; `OPEN_TO_POSSIBILITIES` partially matches all.
- **interests** — weighted Jaccard, rarer shared interests count more.
- **lifestyle** — distance across smoking, drinking, children, pets, activity.
- **personality** — cosine similarity of trait vectors with a complementarity allowance.
- **age** — mutual satisfaction of both users' age ranges, soft edges.
- **location** — decay by distance vs. each user's `max_distance_km`.
- **preferences** — hard/soft preference satisfaction (verified-only, languages, etc.).

**Hard filters (before scoring):** age 18+, gender preference, blocks, banned/suspended,
`discoverable = false`, incognito, already liked/passed, max distance ceiling.

**Reasons:** top 3 contributing factors rendered as plain sentences
("You are both looking for a serious relationship.", "You both enjoy travel.").
Copy never implies guaranteed outcomes.

**Ranking:** `final = score × freshness × activity × boost_multiplier × diversity_penalty`.
Recently shown profiles are suppressed; the feed relaxes filters progressively when supply
is thin, and always tells the user when it has widened the radius.

## 2. AI architecture
All AI runs **server-side** through the AI Gateway. No keys in the client.

| Use case | Mode | Human in the loop |
|---|---|---|
| Bio drafting / improvement | On-demand, user-approved | User edits before saving |
| Conversation starters | On-demand suggestions | User sends or discards |
| Compatibility explanation phrasing | Templated + AI polish | Deterministic score, AI only phrases |
| Scam / money-request detection | Async on message create | Warning banner; report path |
| Toxicity / harassment detection | Async | Flag → moderation queue |
| Image/profile content screening | On upload | Hold + human review on high risk |
| Fake-profile / velocity signals | Batch | Case creation only |

Guardrails:
1. AI may **flag, score, warn, and queue** — never ban, suspend, or delete alone.
2. Risk score thresholds: `< 0.4` log only · `0.4–0.7` warn user + queue · `> 0.7`
   restrict feature + urgent human review.
3. No decisions based on protected characteristics; prompts exclude race, religion,
   ethnicity, and orientation as decision inputs.
4. All model outputs stored with model id, version, and score for auditability.
5. Users can appeal any AI-influenced action; appeals are human-reviewed.
6. Message content used for safety scanning only; not used for model training.
