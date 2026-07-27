/*
 * يتحقق من صفحة الحاسبة المدمجة (app/src/main/assets/index.html) قبل بناء الـ APK:
 *   1. صحة الحسابات مقابل قيم محسوبة يدويًا، بما فيها الحالات الحدّية
 *   2. حفظ الإعدادات في localStorage واستعادتها بعد إعادة التحميل
 *   3. تحميل الخطوط المدمجة فعليًا (لا اعتماد على الشبكة)
 *   4. نص المشاركة
 * ثم يأخذ لقطتين (نهاري/ليلي) في tools/screenshots/ للمعاينة البصرية.
 *
 * التشغيل:  node tools/verify-page.js
 * (يحتاج NODE_PATH يشير إلى مجلد فيه playwright)
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'app/src/main/assets');
const SHOTS = path.join(__dirname, 'screenshots');
const PREINSTALLED = '/opt/pw-browsers/chromium';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
};

let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n      المتوقع: ${JSON.stringify(expected)}\n      الفعلي:  ${JSON.stringify(actual)}`}`);
}

// خادم محلي بسيط: localStorage لا يعمل بشكل موثوق على أصول file://،
// وهو نفس السبب الذي يجعل التطبيق يستخدم WebViewAssetLoader بدل file://.
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
      const file = path.join(ASSETS, rel);
      if (!file.startsWith(ASSETS) || !fs.existsSync(file)) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function readResults(page) {
  return page.evaluate(() => ({
    fee: document.getElementById('rFee').textContent,
    priceInc: document.getElementById('rPriceInc').textContent,
    totalKwd: document.getElementById('rTotalKwd').textContent,
    totalSar: document.getElementById('rTotalSar').textContent,
    gram: document.getElementById('rGram').textContent,
    caption: document.getElementById('gramDesc').textContent,
    copyDisabled: document.getElementById('btnCopy').disabled,
  }));
}

async function fill(page, values) {
  for (const [id, value] of Object.entries(values)) {
    await page.fill(`#${id}`, String(value));
  }
}

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const launchOpts = fs.existsSync(PREINSTALLED) ? { executablePath: PREINSTALLED } : {};
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    // نمنع أي وصول للشبكة الخارجية: كل شيء لازم يكون مدمجًا محليًا.
    offline: false,
  });

  // أي طلب خارج الخادم المحلي = اعتماد على الإنترنت، وهذا فشل.
  const external = [];
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (!url.startsWith(`http://127.0.0.1:${server.address().port}`)) external.push(url);
    route.continue();
  });

  // الصفحة تقرأ window.AndroidBridge مرة واحدة عند التحميل، فنحقنه قبل ذلك
  // لنختبر نفس المسار الذي يسلكه التطبيق على الجهاز.
  await context.addInitScript(() => {
    window.__shared = null;
    window.AndroidBridge = {
      copy: (t) => { window.__shared = t; },
      share: (t) => { window.__shared = t; },
    };
  });

  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });

  console.log('\n▸ الحسابات');
  // حالة 1: سعر 100 د.ك، نسبة 3%، شحن 5، صرف 12.20، وزن 50 جرام
  //   العمولة = 100 × 0.03 = 3.000
  //   شامل الرابط = 103.000 · الإجمالي = 108.000 د.ك
  //   بالريال = 108 × 12.20 = 1,317.60 · الغرام = 1317.6 ÷ 50 = 26.352 ≈ 26.35
  await fill(page, { rate: 12.20, pct: 3, weight: 50, price: 100, ship: 5 });
  let r = await readResults(page);
  check('العمولة', r.fee, '3.000 د.ك');
  check('شامل رابط الدفع', r.priceInc, '103.000 د.ك');
  check('الإجمالي بالدينار', r.totalKwd, '108.000 د.ك');
  check('الإجمالي بالريال', r.totalSar, '1,317.60 ريال');
  check('سعر الغرام', r.gram, '26.35ريال/جرام');
  check('الأزرار مفعّلة', r.copyDisabled, false);

  // حالة 2: سعر 250، نسبة 2.5% ⇒ 6.250 · شحن 3.75 ⇒ 260.000 د.ك
  //   بالريال = 260 × 12.20 = 3,172.00 · الغرام = 3172 ÷ 40 = 79.30
  await fill(page, { pct: 2.5, weight: 40, price: 250, ship: 3.75 });
  r = await readResults(page);
  check('العمولة (2.5%)', r.fee, '6.250 د.ك');
  check('الإجمالي بالدينار', r.totalKwd, '260.000 د.ك');
  check('الإجمالي بالريال', r.totalSar, '3,172.00 ريال');
  check('سعر الغرام', r.gram, '79.30ريال/جرام');

  console.log('\n▸ الحالات الحدّية');
  // وزن = 0 ⇒ لا يُقسم على صفر، وتُعطّل أزرار النسخ والمشاركة
  await fill(page, { weight: '' });
  r = await readResults(page);
  check('وزن فارغ ⇒ الغرام صفر', r.gram, '0.00ريال/جرام');
  check('وزن فارغ ⇒ رسالة إرشادية', r.caption, 'أدخل الوزن والسعر لعرض النتيجة');
  check('وزن فارغ ⇒ الأزرار معطّلة', r.copyDisabled, true);

  // كل الحقول فارغة
  await fill(page, { weight: '', price: '', ship: '' });
  r = await readResults(page);
  check('حقول فارغة ⇒ إجمالي صفر', r.totalKwd, '0.000 د.ك');
  check('حقول فارغة ⇒ الأزرار معطّلة', r.copyDisabled, true);

  console.log('\n▸ نص المشاركة');
  await fill(page, { rate: 12.20, pct: 3, weight: 50, price: 100, ship: 5, desc: 'سبحة كهرمان بلطيق' });
  await page.click('#btnCopy');
  const copied = await page.evaluate(() => window.__shared);
  check('نص النسخ', copied, [
    '📿 مزاد سبحة كهرمان',
    '━━━━━━━━━━━━━━━',
    'القطعة: سبحة كهرمان بلطيق',
    'الوزن: 50.00 جرام',
    'سعر المزاد: 100.000 د.ك',
    'نسبة رابط الدفع (3%): 3.000 د.ك',
    'الشحن: 5.000 د.ك',
    'الإجمالي: 108.000 د.ك',
    'الإجمالي: 1,317.60 ريال',
    '━━━━━━━━━━━━━━━',
    '⭐ سعر الغرام: 26.35 ريال/جرام',
  ].join('\n'));

  // بدون وصف وبدون شحن: يُحذف السطران بدل طباعتهما فارغين.
  await page.fill('#desc', '');
  await page.fill('#ship', '');
  await page.click('#btnShare');
  const noExtras = await page.evaluate(() => window.__shared);
  check('بدون وصف ⇒ لا سطر "القطعة"', noExtras.includes('القطعة:'), false);
  check('بدون شحن ⇒ لا سطر "الشحن"', noExtras.includes('الشحن:'), false);
  await fill(page, { ship: 5, desc: 'سبحة كهرمان بلطيق' });

  console.log('\n▸ حفظ الإعدادات');
  await page.fill('#rate', '13.5');
  await page.fill('#pct', '4');
  await page.waitForTimeout(900);           // ننتظر الـ debounce
  const stored = await page.evaluate(() => localStorage.getItem('settings'));
  check('حُفظ في localStorage', stored, '{"rate":13.5,"pct":4}');

  await page.reload({ waitUntil: 'networkidle' });
  const restored = await page.evaluate(() => ({
    rate: document.getElementById('rate').value,
    pct: document.getElementById('pct').value,
  }));
  check('استُعيد سعر الصرف بعد إعادة التحميل', restored.rate, '13.5');
  check('استُعيدت النسبة بعد إعادة التحميل', restored.pct, '4');

  console.log('\n▸ الخطوط المدمجة');
  await page.evaluate(() => document.fonts.ready);
  const fontsOk = await page.evaluate(() => ({
    cairo700: document.fonts.check('700 16px Cairo'),
    cairo900: document.fonts.check('900 26px Cairo'),
    tajawal400: document.fonts.check('400 16px Tajawal'),
    tajawal500: document.fonts.check('500 16px Tajawal'),
    tajawal700: document.fonts.check('700 16px Tajawal'),
  }));
  for (const [name, ok] of Object.entries(fontsOk)) check(`الخط ${name}`, ok, true);
  check('لا طلبات شبكة خارجية', external.length, 0);
  if (external.length) console.log('      ', external.slice(0, 5));

  console.log('\n▸ اللقطات');
  fs.mkdirSync(SHOTS, { recursive: true });
  await fill(page, { rate: 12.20, pct: 3, weight: 50, price: 100, ship: 5, desc: 'سبحة كهرمان بلطيق رومي' });
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.waitForTimeout(250);
    const file = path.join(SHOTS, `${scheme}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`  ✓ ${path.relative(ROOT, file)}`);
  }

  await browser.close();
  server.close();

  console.log(failures === 0 ? '\n✅ كل الفحوصات نجحت\n' : `\n❌ ${failures} فحص فشل\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
