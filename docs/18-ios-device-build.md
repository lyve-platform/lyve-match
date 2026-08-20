# 18 — بناء تطبيق LYVE على iPhone (بدون Mac)

الهدف: تثبيت تطبيق LYVE الأصلي على iPhone حتى يعمل شراء Premium عبر StoreKit (Sandbox ثم Production).

## الوضع الحالي

- مشروع Capacitor الأصلي تم توليده في `ios/App/App.xcworkspace` (appId: `app.lyve.ios`).
- الشِل يفتح التطبيق المستضاف `https://lyve-match.lovable.app` ويضيف StoreKit فقط.
- الخادم جاهز: التحقق من JWS، webhook آبل، وتفعيل الاشتراك.

## المسار الموصى به: GitHub Actions → TestFlight

Workflow: `.github/workflows/ios-testflight.yml` (تشغيل يدوي من تبويب **Actions → iOS TestFlight Build → Run workflow**).

### 1) اربط المشروع بـ GitHub

من محرر Lovable: زر **+ → GitHub → Connect project**.

### 2) أضف الأسرار في GitHub

**Settings → Secrets and variables → Actions → New repository secret**

| Secret                     | من أين تحصل عليه                                                    |
| -------------------------- | ------------------------------------------------------------------- |
| `APPLE_TEAM_ID`            | App Store Connect → Membership details → Team ID                    |
| `APPSTORE_ISSUER_ID`       | Users and Access → Integrations → App Store Connect API → Issuer ID |
| `APPSTORE_KEY_ID`          | نفس الصفحة → Key ID للمفتاح                                         |
| `APPSTORE_PRIVATE_KEY`     | محتوى ملف `AuthKey_XXXX.p8` كاملاً (بما فيه أسطر BEGIN/END)         |
| `IOS_DIST_CERT_P12_BASE64` | شهادة Apple Distribution بصيغة `.p12` محوّلة: `base64 -i cert.p12`  |
| `IOS_DIST_CERT_PASSWORD`   | كلمة مرور ملف الـ p12                                               |

> إنشاء شهادة التوزيع بدون Mac: Apple Developer → Certificates → **Apple Distribution** (تحتاج CSR؛ يمكن توليده عبر OpenSSL ثم تصدير الشهادة والمفتاح إلى `.p12`).

### 3) شغّل الـ workflow

سيقوم بـ: تثبيت الحزم → بناء الويب → `cap sync ios` → توقيع → أرشفة → تصدير IPA → رفع إلى TestFlight.

### 4) ثبّت على iPhone

1. App Store Connect → **TestFlight** → أضف نفسك كـ Internal Tester.
2. حمّل تطبيق **TestFlight** من App Store على الآيفون.
3. ثبّت LYVE Match منه.

### 5) اختبار شراء Sandbox

1. iPhone → **Settings → App Store → Sandbox Account** → سجّل دخول حساب Sandbox Tester.
2. افتح LYVE → Premium → اشترِ.
3. الخادم يتحقق من JWS ويفعّل الاشتراك، وإشعار آبل يصل إلى `/api/public/webhooks/apple`.

## البديل: Mac + Xcode

```bash
bun install && bun run build && bunx cap sync ios
open ios/App/App.xcworkspace
```

ثم اختر جهازك في Xcode واضغط Run (يكفي حساب مطور مجاني للتجربة، لكن Sandbox IAP يحتاج حساباً مدفوعاً).

## ملاحظات

- منتجات الاشتراك بحالة _Prepare for Submission_ تعمل في Sandbox طالما لها Price + Localization.
- بيئة Production تحتاج نشر التطبيق في المتجر ومفاتيح آبل الإنتاجية.
