#!/usr/bin/env bash
#
# ينزّل خطوط Cairo و Tajawal (مقطعي arabic و latin فقط) من Google Fonts
# ويولّد ملف app/src/main/assets/fonts.css الذي يشير إلى النسخ المحلية.
#
# الأوزان هنا هي المستخدمة فعليًا في index.html فقط:
#   Cairo   700, 900
#   Tajawal 400, 500, 700
#
# التشغيل:  bash tools/fetch-fonts.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASSETS="$ROOT/app/src/main/assets"
FONTS_DIR="$ASSETS/fonts"
CSS_OUT="$ASSETS/fonts.css"

# Google Fonts يخدم woff2 فقط للمتصفحات الحديثة، ويرجّع ttf للـ User-Agent المجهول.
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

FACES=(
  "Cairo:700"
  "Cairo:900"
  "Tajawal:400"
  "Tajawal:500"
  "Tajawal:700"
)

mkdir -p "$FONTS_DIR"
rm -f "$FONTS_DIR"/*.woff2

{
  echo "/* خطوط مدمجة محليًا — مولّدة بواسطة tools/fetch-fonts.sh، لا تعدّلها يدويًا */"
  echo "/* المصدر: Google Fonts — Cairo & Tajawal، رخصة SIL Open Font License 1.1 */"
  echo
} > "$CSS_OUT"

for face in "${FACES[@]}"; do
  family="${face%%:*}"
  weight="${face##*:}"

  css="$(curl -sS --fail -A "$UA" \
    "https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&display=swap")"

  # نمشي على الملف كتلة كتلة: نتذكّر اسم المقطع من التعليق الذي يسبق كل @font-face،
  # ونستخرج رابط الـ woff2 و unicode-range للمقاطع التي تهمنا فقط.
  for subset in arabic latin; do
    block="$(printf '%s\n' "$css" | awk -v want="/* $subset */" '
      $0 == want { grab = 1; next }
      grab && /^\/\*/ { grab = 0 }
      grab { print }
      grab && /^}/ { exit }
    ')"

    url="$(printf '%s\n' "$block" | grep -o 'https://[^)]*\.woff2' | head -1)"
    range="$(printf '%s\n' "$block" | grep -o 'unicode-range: [^;]*' | head -1 | sed 's/unicode-range: //')"

    if [ -z "$url" ] || [ -z "$range" ]; then
      echo "خطأ: تعذّر إيجاد مقطع $subset للخط $family $weight" >&2
      exit 1
    fi

    file="$(printf '%s' "$family" | tr '[:upper:]' '[:lower:]')-${weight}-${subset}.woff2"
    curl -sS --fail -A "$UA" -o "$FONTS_DIR/$file" "$url"

    cat >> "$CSS_OUT" <<EOF
@font-face {
  font-family: '$family';
  font-style: normal;
  font-weight: $weight;
  font-display: block;
  src: url(fonts/$file) format('woff2');
  unicode-range: $range;
}
EOF
    echo "  ✓ $file ($(stat -c%s "$FONTS_DIR/$file") bytes)"
  done
done

echo
echo "تم توليد $CSS_OUT"
echo "المجموع: $(du -sh "$FONTS_DIR" | cut -f1) في $(ls -1 "$FONTS_DIR" | wc -l) ملف"
