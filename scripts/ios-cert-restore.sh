#!/usr/bin/env bash
# LYVE — استعادة مفتاح توقيع iOS من مخزن الأسرار وبناء ملف .p12
#
# المفتاح الخاص محفوظ الآن في السر: IOS_DIST_PRIVATE_KEY_PEM
# وطلب الشهادة محفوظ في:            IOS_DIST_CSR_PEM
# لذلك لا يضيعان عند تصفير بيئة العمل.
#
# الاستخدام:
#   ./scripts/ios-cert-restore.sh csr                 # يطبع الـ CSR لرفعه إلى آبل
#   ./scripts/ios-cert-restore.sh p12 <password>      # بعد وضع ملف .cer داخل ios-certs/
set -euo pipefail
DIR="ios-certs"
mkdir -p "$DIR"

restore_key() {
  if [ -z "${IOS_DIST_PRIVATE_KEY_PEM:-}" ]; then
    echo "❌ السر IOS_DIST_PRIVATE_KEY_PEM غير متاح في هذه البيئة." >&2
    exit 1
  fi
  printf '%s\n' "$IOS_DIST_PRIVATE_KEY_PEM" > "$DIR/lyve.key"
  chmod 600 "$DIR/lyve.key"
}

case "${1:-}" in
  csr)
    if [ -n "${IOS_DIST_CSR_PEM:-}" ]; then
      printf '%s\n' "$IOS_DIST_CSR_PEM" | tee "$DIR/lyve.csr"
    else
      restore_key
      openssl req -new -key "$DIR/lyve.key" -out "$DIR/lyve.csr" \
        -subj "/emailAddress=almansoori570@gmail.com/CN=LYVE/C=AE"
      cat "$DIR/lyve.csr"
    fi
    ;;
  p12)
    PASS="${2:?password required}"
    restore_key
    CER=$(ls "$DIR"/*.cer | head -1)
    openssl x509 -inform DER -in "$CER" -out "$DIR/dist.pem" -outform PEM
    # تحقق من تطابق الشهادة مع المفتاح قبل التصدير
    a=$(openssl x509 -in "$DIR/dist.pem" -noout -pubkey | openssl md5)
    b=$(openssl pkey -in "$DIR/lyve.key" -pubout | openssl md5)
    [ "$a" = "$b" ] || { echo "❌ الشهادة لا تطابق المفتاح المحفوظ." >&2; exit 1; }
    openssl pkcs12 -export -legacy -inkey "$DIR/lyve.key" -in "$DIR/dist.pem" \
      -out "$DIR/lyve-dist.p12" -passout "pass:$PASS" \
      || openssl pkcs12 -export -inkey "$DIR/lyve.key" -in "$DIR/dist.pem" \
         -out "$DIR/lyve-dist.p12" -passout "pass:$PASS"
    base64 -w0 "$DIR/lyve-dist.p12" > "$DIR/p12-base64.txt" 2>/dev/null \
      || base64 "$DIR/lyve-dist.p12" | tr -d '\n' > "$DIR/p12-base64.txt"
    echo "✅ تم إنشاء $DIR/lyve-dist.p12 و $DIR/p12-base64.txt"
    ;;
  *)
    echo "usage: $0 csr | $0 p12 <password>"; exit 1;;
esac
