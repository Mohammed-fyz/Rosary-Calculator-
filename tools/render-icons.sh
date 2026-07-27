#!/usr/bin/env bash
#
# يحوّل tools/icon.svg إلى أيقونات PNG لأجهزة API 24-25 التي لا تدعم
# الأيقونات التكيّفية (adaptive icons). أجهزة API 26+ تستخدم
# res/mipmap-anydpi-v26/ic_launcher.xml بدلًا عنها.
#
# التشغيل:  bash tools/render-icons.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RES="$ROOT/app/src/main/res"

node -e '
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const root = process.argv[1];
const svg = fs.readFileSync(path.join(root, "tools/icon.svg"), "utf8");
const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

// نستخدم Chromium المثبّت في البيئة إن وُجد، بدل تنزيل نسخة جديدة.
const preinstalled = "/opt/pw-browsers/chromium";
const launchOpts = fs.existsSync(preinstalled) ? { executablePath: preinstalled } : {};

(async () => {
  const browser = await chromium.launch(launchOpts);
  for (const [density, size] of Object.entries(sizes)) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<style>html,body{margin:0;padding:0;background:transparent}
       svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
    );
    const dir = path.join(root, "app/src/main/res", `mipmap-${density}`);
    fs.mkdirSync(dir, { recursive: true });
    const buf = await page.screenshot({ omitBackground: true });
    fs.writeFileSync(path.join(dir, "ic_launcher.png"), buf);
    fs.writeFileSync(path.join(dir, "ic_launcher_round.png"), buf);
    console.log(`  ✓ mipmap-${density}/ic_launcher.png (${size}x${size})`);
    await page.close();
  }
  await browser.close();
})();
' "$ROOT"

echo "تم توليد أيقونات PNG الاحتياطية في $RES"
