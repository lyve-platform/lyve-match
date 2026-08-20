# LYVE — Information Architecture, Sitemap, Screens

## 1. Sitemap

```text
Public
  /                    Landing (hero, how it works, safety, compatibility, premium, FAQ)
  /legal/privacy       Privacy Policy
  /legal/terms         Terms
  /safety              Safety Center (public)
  /help                Help / FAQ

Auth
  /auth/signup   /auth/login   /auth/age-gate   /auth/otp   /auth/recover

Onboarding (gated, sequential)
  /onboarding/[1..14]  welcome, age, name, gender, interested-in, looking-for,
                       location, interests, lifestyle, photos, bio,
                       discovery-prefs, privacy, complete

App (authenticated, bottom nav: Discover · Likes · Matches · Messages · Profile)
  /app/discover              /app/discover/:userId (profile details)
  /app/likes                 (received / sent, Premium reveal)
  /app/matches
  /app/messages              /app/messages/:conversationId
  /app/notifications
  /app/profile               /app/profile/edit  /app/profile/photos
  /app/premium               /app/boost  /app/super-like
  /app/verification
  /app/settings              account, discovery-preferences, privacy, notifications,
                             intent, language & region, blocked, subscription,
                             delete-account
  /app/report/:targetId      /app/appeals

Admin (RBAC, separate shell)
  /admin                    Overview KPIs
  /admin/users              search, filter, detail, actions
  /admin/moderation         reports, flagged messages/profiles/images, AI queue
  /admin/verification
  /admin/payments           subscriptions, transactions, refunds, failures
  /admin/plans              plan & pricing configuration
  /admin/matching           compatibility weight configuration
  /admin/analytics          DAU, MAU, retention, match/message rate, conversion, churn
  /admin/audit              audit logs
  /admin/staff              admin users & roles
```

## 2. Screen list (MVP)

Splash · Landing · Sign Up · Login · Age Gate · OTP · Onboarding (14) · Profile Setup ·
Photo Upload · Preferences · Discover · Profile Details · Likes · Matches · Messages ·
Conversation · Notifications · Premium · Boost · Super Like · Verification · Privacy ·
Settings · Help · Report · Block confirm · Account Deletion · Appeal status ·
Admin (9 screens above).

## 3. Navigation rules

- Bottom tab bar on mobile; left rail on desktop ≥1024px.
- Onboarding is linear with progress bar; optional steps show "Skip for now".
- Destructive actions (block, unmatch, delete, ban) always require confirmation.

## 4. Design system direction

- Mood: premium, warm, minimal, romantic, global, trustworthy. Not neon, not Tinder-red.
- Tokens only (oklch semantic variables): background, foreground, primary (warm ember),
  secondary (deep plum), accent (soft gold), muted, destructive, success, surfaces,
  gradients (`--gradient-warm`), shadows (`--shadow-soft`, `--shadow-lift`).
- Type: an expressive display face for headings + a neutral, RTL-capable text face.
  Arabic uses a dedicated Arabic family; all layout uses logical properties
  (`ms-*`, `me-*`, `start/end`) so RTL mirrors without overrides.
- Components: Card, ProfileCard, IntentChip, CompatibilityRing, SafetyBanner,
  StepProgress, PhotoGrid, ChatBubble, EmptyState, PremiumCTA, AdminTable.
- Motion: soft spring on card actions, subtle fade/scale on match reveal. No confetti spam.

## 5. Localization

- Locale files `en`, `ar`; direction from locale, `dir` on `<html>`.
- All dates/numbers/currencies via Intl; per-user timezone; no hard-coded strings in UI.
