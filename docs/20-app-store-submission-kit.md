# LYVE — App Store Submission Kit

Everything below is copy-paste ready for App Store Connect. Nothing here claims a
feature LYVE does not actually ship. No religious positioning, no Tinder-style
framing.

- App name: **LYVE**
- Subtitle (30 chars max): **Meet. Match. Belong.** (21)
- Primary category: Social Networking
- Secondary category: Lifestyle
- Age rating: 18+
- Bundle id: `app.lyve.ios`

---

## 1. Promotional Text (170 chars max)

> Real people, real intentions. Choose what you're looking for — dating, a
> relationship, or marriage — and meet members who want the same. (139)

Alternate (shorter):

> You choose the intention. LYVE matches you with people who want the same thing.
> Verified profiles, private by design. (118)

---

## 2. Description (4000 chars max)

```
LYVE is a modern dating and relationships app for adults who are clear about what they want.

Instead of guessing, you choose your intention — casual dating, a serious relationship, or marriage — and LYVE introduces you to members who are looking for the same thing. No mixed signals, no wasted conversations.

MEET. MATCH. BELONG.

WHY LYVE

You set the intention
Every member states what they are looking for. LYVE never assumes it for you, and you can change it whenever your goals change.

Compatibility, not just photos
LYVE looks at values, lifestyle, life goals and preferences to show you people you are genuinely likely to connect with — and explains why you matched.

Verified members
Members can complete photo verification to earn a Verified badge, so you know the person on the other side is real. Verification is optional but visible, which makes catfishing far harder.

Private by design
LYVE never shows your phone number, email address, exact address or location coordinates to other members. Location is shown only as an approximate area. Your matches see your profile, not your personal data.

Safety you control
Block or report anyone in one tap, unmatch instantly, and manage exactly who can reach you. Reports go to a trained moderation team, and our safety systems flag harmful behaviour automatically.

Conversations that go somewhere
Messaging opens only after a mutual match, so nobody can message you out of nowhere.

LYVE PREMIUM (optional)

Premium is an auto-renewing subscription that unlocks:
- See everyone who liked you
- Advanced discovery preferences
- Deeper compatibility insights
- Rewind your last pass
- Unlimited likes

LYVE works fully without Premium — discovery, matching, messaging and all safety tools are free.

WHO LYVE IS FOR

Adults 18 and over, anywhere in the world, who want to meet people with the same intentions and be treated with respect while doing it.

SUBSCRIPTION TERMS

Payment is charged to your Apple ID account at confirmation of purchase. Subscriptions renew automatically unless auto-renew is turned off at least 24 hours before the end of the current period. Your account is charged for renewal within 24 hours before the end of the current period. You can manage and cancel subscriptions in your Apple ID Account Settings after purchase. Prices are shown in your local currency in the app.

Terms of Use: https://lyve-match.lovable.app/terms
Privacy Policy: https://lyve-match.lovable.app/privacy
Community Guidelines: https://lyve-match.lovable.app/community-guidelines
Support: https://lyve-match.lovable.app/support
```

---

## 3. Keywords (100 chars max, comma separated, no spaces)

```
dating,relationship,marriage,serious,match,meet,singles,compatibility,verified,love,chat,connect
```

Character count: 96. Do not repeat words already in the app name or subtitle
("LYVE", "meet", "match", "belong" are indexed from those fields), so if you need
room, drop `meet,match` first.

---

## 4. App Privacy (Privacy Nutrition Labels)

Answer **Yes** to "Does this app collect data?"

### Data Linked to You

| Category | Data type | Purposes | Notes |
| --- | --- | --- | --- |
| Contact Info | Email Address | App Functionality | Account identity and sign-in only. Never shown to other members. |
| User Content | Photos or Videos | App Functionality | Profile photos and verification selfies. |
| User Content | Other User Content | App Functionality | Messages, profile answers, reports. |
| Identifiers | User ID | App Functionality | Internal account id. |
| Location | Coarse Location | App Functionality | Approximate area for discovery. Precise location is never collected. |
| Sensitive Info | Sensitive Info | App Functionality | Relationship intention and lifestyle answers the member enters voluntarily. |
| Usage Data | Product Interaction | Analytics, App Functionality | Likes, passes, matches — used to power matching and abuse detection. |
| Purchases | Purchase History | App Functionality | Subscription state received from Apple. |
| Diagnostics | Crash Data, Performance Data | App Functionality | Error reporting. |

### Data Not Linked to You

None.

### Tracking

Answer **No** to "Do you or your third-party partners use data for tracking?"
LYVE does not use IDFA, does not run an ad network, and does not share data with
data brokers.

### Related answers elsewhere in App Store Connect

- Account deletion available in app: **Yes** — Settings → Delete account.
- Encryption (`ITSAppUsesNonExemptEncryption`): **false** — HTTPS only, exempt.
- Advertising Identifier: **No**.
- Content rights: LYVE does not contain third-party content.

---

## 5. Review Notes

```
Thank you for reviewing LYVE.

WHAT LYVE IS
LYVE is an 18+ dating and relationships app. Members state the intention they are looking for (dating, relationship, or marriage) and are matched with members who want the same. Messaging is only possible after a mutual match.

ARCHITECTURE (important context)
The iOS app is a thin native shell (Capacitor) around our own web application, plus a native StoreKit 2 plugin for in-app purchases. All product logic, matching, messaging, moderation and access control run on our servers. No third-party browser is opened; the app does not link out to any external purchase flow, and there is no way to buy a subscription outside of Apple IAP.

SIGN-IN
Account creation is open to everyone — no invite code, no approval queue.
Options: email + password, Sign in with Apple, and Google.

Demo account for review:
Email: <REVIEW_EMAIL>
Password: <REVIEW_PASSWORD>
This account is pre-populated with a completed profile, candidates in Discovery, and one existing match with a conversation, so all core flows can be exercised immediately.

HOW TO SEE THE MAIN FLOWS
1. Sign in with the demo account above.
2. Discover tab — swipe/like/pass through candidate profiles.
3. Matches tab — open the existing match.
4. Messages — send a message inside the match.
5. Profile tab — edit profile, photos, intention.
6. Safety — the "..." menu on any profile offers Block and Report.

IN-APP PURCHASES (StoreKit 2)
Products:
- app.lyve.ios.premium.monthly (auto-renewable)
- app.lyve.ios.premium.annual (auto-renewable)

To test: Profile → Premium (or the Premium entry point on any locked feature).
Prices displayed are StoreKit's localized displayPrice for the reviewer's storefront — LYVE never hard-codes a price.

Purchase flow: StoreKit returns a signed transaction (JWS). The app posts it to our server, which verifies it against the App Store Server API and only then grants the Premium entitlement. The client can never grant entitlements itself. "Restore Purchases" is available on the same screen and re-verifies existing entitlements for the signed-in Apple ID.

Premium unlocks: who liked me, advanced preferences, compatibility insights, rewind, unlimited likes. All core functionality (discovery, matching, messaging, safety) works without a subscription.

SAFETY & MODERATION (Guideline 1.2)
- 18+ only; date of birth is required at signup and under-18 accounts are rejected.
- Members must agree to our Community Guidelines before use.
- Block, unmatch and report are available on every profile and conversation.
- Reports are reviewed by our moderation team through an internal admin console, and abusive accounts are suspended or banned.
- Automated safety checks flag harmful content and behaviour.
- Personal contact data (phone, email, exact address, coordinates) is never displayed to other members.

ACCOUNT DELETION (Guideline 5.1.1(v))
Settings → Delete account. This is a full deletion request that removes the profile, photos, messages and account.

LINKS
Privacy Policy: https://lyve-match.lovable.app/privacy
Terms of Use: https://lyve-match.lovable.app/terms
Community Guidelines: https://lyve-match.lovable.app/community-guidelines
Support: https://lyve-match.lovable.app/support

Please contact us through App Store Connect if anything is unclear — we respond same day.
```

Replace `<REVIEW_EMAIL>` / `<REVIEW_PASSWORD>` with the real demo credentials in
the **App Review Information → Sign-In Required** fields (put them there as well,
not only in the notes).

---

## 6. Screenshot captions

Captured sets live in `/mnt/documents/appstore-screenshots/` (6.9" 1290x2796,
6.5" 1242x2688, iPad 13" 2048x2732). Upload in this order:

| # | File | Caption |
| --- | --- | --- |
| 1 | `01-hero.png` | Meet. Match. Belong. |
| 2 | `02-how-it-works.png` | A calm, deliberate path to something real |
| 3 | `03-compatibility.png` | See why you could work |
| 4 | `04-intent.png` | You define what you are looking for |
| 5 | `05-safety.png` | Safety built into the product |
| 6 | `06-trust.png` | Fewer fakes, calmer conversations |
| 7 | `07-premium.png` | Premium is optional — LYVE works free |

---

## 7. Pre-submission checklist

- [ ] Sandbox purchase of monthly succeeds and Premium appears on the profile.
- [ ] Sandbox purchase of annual succeeds.
- [ ] Restore Purchases re-grants Premium on a second device.
- [ ] Demo account signs in, has photos, candidates, one match, one conversation.
- [ ] Delete account works end-to-end.
- [ ] Both IAP products are "Ready to Submit" and attached to this version.
- [ ] Screenshots uploaded for every required size.
- [ ] Privacy Policy, Terms, Support URLs all resolve publicly.
- [ ] App Privacy answers submitted (section 4).
- [ ] Encryption question answered (exempt).
- [ ] Age rating set to 18+.
- [ ] Build selected in the version's Build section.
- [ ] Review Notes and sign-in credentials filled in.
