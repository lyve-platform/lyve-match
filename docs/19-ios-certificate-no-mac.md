# إنشاء شهادة توزيع iOS بدون Mac

كل ما تحتاجه: حساب Apple Developer مفعّل + OpenSSL (موجود في أي جهاز Linux/Windows WSL/Mac).

## 1) توليد المفتاح الخاص وطلب الشهادة (CSR)

```bash
./scripts/ios-cert.sh csr "almansoori570@gmail.com" "LYVE"
```

الناتج:

- `ios-certs/lyve.key` — المفتاح الخاص (سري جداً، لا تشاركه ولا ترفعه على GitHub)
- `ios-certs/lyve.csr` — يُرفع إلى آبل

## 2) إنشاء الشهادة في حساب آبل

1. افتح https://developer.apple.com/account/resources/certificates/list
2. اضغط **+**
3. اختر **Apple Distribution** (أو _iOS Distribution (App Store and Ad Hoc)_)
4. ارفع ملف `lyve.csr`
5. اضغط **Continue → Download** — ستحصل على ملف `.cer`
6. ضع الملف داخل مجلد `ios-certs/`

## 3) تحويل الشهادة إلى ملف .p12

```bash
./scripts/ios-cert.sh p12 "كلمة-مرور-قوية"
```

الناتج:

- `ios-certs/lyve-dist.p12`
- `ios-certs/p12-base64.txt` (نسخة Base64 جاهزة لـ GitHub)

## 4) إنشاء Provisioning Profile

1. https://developer.apple.com/account/resources/profiles/list → **+**
2. اختر **App Store Connect** (Distribution)
3. App ID: `app.lyve.ios`
4. Certificate: الشهادة التي أنشأتها للتو
5. الاسم: `LYVE AppStore` → **Download**

> بديل أسهل: فعّل **Automatic signing** في الـ workflow عبر مفاتيح App Store Connect API، وعندها لا تحتاج ملف Provisioning يدوي.

## 5) إضافة الأسرار في GitHub

GitHub → Settings → Secrets and variables → Actions:

| Secret                     | القيمة                                  |
| -------------------------- | --------------------------------------- |
| `IOS_DIST_CERT_P12_BASE64` | محتوى `p12-base64.txt`                  |
| `IOS_DIST_CERT_PASSWORD`   | كلمة المرور من الخطوة 3                 |
| `APPLE_TEAM_ID`            | من Membership في حساب آبل               |
| `APPSTORE_ISSUER_ID`       | App Store Connect → Integrations → Keys |
| `APPSTORE_KEY_ID`          | نفس الصفحة                              |
| `APPSTORE_PRIVATE_KEY`     | محتوى ملف `AuthKey_XXXX.p8`             |

## 6) البناء

Actions → **iOS TestFlight** → Run workflow. بعد اكتمال البناء يظهر الإصدار في TestFlight على iPhone.

## تنبيهات أمنية

- `ios-certs/` مُستثنى من Git — لا ترفع `.key` أو `.p12` إلى المستودع.
- إذا تسرّب المفتاح: احذف الشهادة من حساب آبل وأنشئ واحدة جديدة.

## حفظ دائم للمفتاح (لا يضيع بعد اليوم)

المفتاح الخاص وطلب الشهادة محفوظان الآن في مخزن أسرار المشروع:

| السر                       | المحتوى                      |
| -------------------------- | ---------------------------- |
| `IOS_DIST_PRIVATE_KEY_PEM` | المفتاح الخاص لشهادة التوزيع |
| `IOS_DIST_CSR_PEM`         | طلب الشهادة (CSR) المرتبط به |

الاستعادة في أي جلسة لاحقة:

```bash
./scripts/ios-cert-restore.sh csr            # يطبع الـ CSR لرفعه إلى آبل
# ضع ملف .cer داخل ios-certs/ ثم:
./scripts/ios-cert-restore.sh p12 "كلمة-المرور"
```

السكربت يرفض التصدير إذا لم تطابق الشهادةُ المفتاحَ المحفوظ.
