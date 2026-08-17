#!/usr/bin/env bash
# LYVE — إنشاء شهادة توزيع iOS بدون Mac (OpenSSL فقط)
#
# الاستخدام:
#   1) ./scripts/ios-cert.sh csr  "your@email.com" "Your Name"
#      -> ينتج ios-certs/lyve.key (سري) و ios-certs/lyve.csr (يُرفع لآبل)
#   2) ارفع lyve.csr في: developer.apple.com > Certificates > + > Apple Distribution
#      نزّل الملف distribution.cer وضعه داخل ios-certs/
#   3) ./scripts/ios-cert.sh p12 "كلمة-مرور-قوية"
#      -> ينتج ios-certs/lyve-dist.p12 و ios-certs/p12-base64.txt
#
set -euo pipefail
DIR="ios-certs"
mkdir -p "$DIR"

case "${1:-}" in
  csr)
    EMAIL="${2:?email required}"
    NAME="${3:?name required}"
    openssl genrsa -out "$DIR/lyve.key" 2048
    openssl req -new -key "$DIR/lyve.key" -out "$DIR/lyve.csr" \
      -subj "/emailAddress=$EMAIL/CN=$NAME/C=AE"
    echo "✅ تم إنشاء $DIR/lyve.csr — ارفعه إلى Apple Developer"
    ;;
  p12)
    PASS="${2:?password required}"
    CER=$(ls "$DIR"/*.cer | head -1)
    openssl x509 -inform DER -in "$CER" -out "$DIR/dist.pem" -outform PEM
    openssl pkcs12 -export -legacy \
      -inkey "$DIR/lyve.key" -in "$DIR/dist.pem" \
      -out "$DIR/lyve-dist.p12" -passout "pass:$PASS" \
      || openssl pkcs12 -export \
         -inkey "$DIR/lyve.key" -in "$DIR/dist.pem" \
         -out "$DIR/lyve-dist.p12" -passout "pass:$PASS"
    base64 -w0 "$DIR/lyve-dist.p12" > "$DIR/p12-base64.txt" 2>/dev/null \
      || base64 "$DIR/lyve-dist.p12" | tr -d '\n' > "$DIR/p12-base64.txt"
    echo "✅ تم إنشاء $DIR/lyve-dist.p12"
    echo "➡️  انسخ محتوى $DIR/p12-base64.txt إلى GitHub Secret: IOS_DIST_CERT_P12_BASE64"
    echo "➡️  وكلمة المرور إلى: IOS_DIST_CERT_PASSWORD"
    ;;
  *)
    echo "usage: $0 csr <email> <name> | $0 p12 <password>"; exit 1;;
esac
