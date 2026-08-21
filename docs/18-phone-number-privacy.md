# Phone number privacy and masking (LYVE)

## Where the number lives
The verified phone number is stored **only inside the authentication system**
(`auth.users.phone` / `phone_confirmed_at`). `public.profiles` stores no phone
number — it holds a single derived timestamp, `phone_verified_at`, plus the
masked hint returned by the `sync_phone_verification()` RPC.

## Masking rule
- Format returned to the client: `••••` + the last 4 digits (e.g. `+971 50 123 4567` → `••••4567`).
- The full number is never serialized into loader data, profile payloads,
  discovery/match/chat responses, or OG/meta tags.
- The mask is produced server-side by the RPC; the browser never receives more
  than the last four digits.

## Who can see what

| Audience | Sees |
| --- | --- |
| The member (Settings → Phone number visibility) | Masked hint only (`••••1234`) |
| Authentication service / SMS provider | Full number, to deliver the OTP |
| Trust & Safety staff | Full number **only** while investigating a report or appeal on that account; access is written to `admin_audit_logs` |
| Other members, including matches | Nothing — no full or partial number, no "has phone" leak beyond the generic Verified badge |
| Public web, search engines, exports | Nothing |

## Product surfaces
- `src/components/lyve/PhoneVerificationCard.tsx` — profile page: request and
  confirm the SMS code.
- `src/components/lyve/PhoneVisibilityCard.tsx` — settings page section
  "Phone number visibility": shows the masked value, the mask rule, and the
  can-see / cannot-see lists.
- Copy lives in `src/i18n/en.verification.ts` (`phoneVerification`, `phoneVisibility`).

## Removal
Account deletion removes the number with the rest of the account data
(`purge_expired_accounts`). Support can unlink a number on request without
deleting the account.

## SMS delivery dependency
OTP delivery requires an SMS provider configured on the authentication service
(Twilio Verify or Twilio Programmable Messaging). Until that is connected, code
sending fails and the card surfaces the "couldn't send the code" state — no
verification state changes.
