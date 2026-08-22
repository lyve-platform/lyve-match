# LYVE — Android (Google Play) build

The Android app is the same Capacitor shell used on iOS, pointed at
`https://lyve-match.lovable.app`.

- Package name (applicationId): `app.lyve.android`
- App name: `LYVE Match`
- Default version: `1.0.1`, versionCode = GitHub Actions run number
- Project: `android/` (generated with `bunx cap add android`)
- Workflow: `.github/workflows/android-play.yml` → produces a signed **AAB**
  artifact named `lyve-android-aab`.

## Required GitHub Secrets

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | contents of `ANDROID_KEYSTORE_BASE64.txt` (base64 of `upload.jks`) |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | `lyve-upload` |
| `ANDROID_KEY_PASSWORD` | same as the keystore password |

Keep `upload.jks` safe — Play ties the upload key to the app forever
(recoverable only through Play support if lost).

## Release steps

1. Add the four secrets above in GitHub → Settings → Secrets and variables → Actions.
2. Actions → **Android Play Build** → Run workflow (set version name/code if needed).
3. Download the `lyve-android-aab` artifact.
4. Play Console → **Production → Create new release** → upload the AAB → Save → Review → Roll out.
5. After the first release is processed, create the subscriptions in
   **Monetise with Play → Products → Subscriptions**:
   - `premium_monthly` — base plan auto-renewing, 1 month, USD 29.99
   - `premium_annual` — base plan auto-renewing, 1 year, USD 99.99

## Notes

- Google Play Billing **is** wired into the shell (`LyveBilling.java`, Billing
  Client v7) and the server verifies purchase tokens before granting Premium.
- Live subscriptions in Play Console: `premium_monthly` (base plan
  `monthly-auto`, 29.99 USD) and `premium_annual` (base plan `annual-auto`,
  99.99 USD). Both must stay **Active** or the paywall shows no prices.

- Local build: `bun run build && bunx cap sync android && cd android && ./gradlew bundleRelease`
  (requires JDK 21 and the Android SDK).
