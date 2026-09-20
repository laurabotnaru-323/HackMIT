// Where exactly is the lightest pixel under a caption box?
// node tools/probe.js <bandIndex 1-4> <p>
const puppeteer = require('puppeteer-core');
const [, , bandArg = '2', pArg = '0.43'] = process.argv;
const idx = +bandArg - 1, p = +pArg;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
    defaultViewport: { width: 1440, height: 810 },
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:8000/index.html', { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => document.querySelector('#stage').classList.contains('video-ready'), { timeout: 60000 });
  await new Promise(r => setTimeout(r, 1500));

  const heroH = await page.evaluate(() => document.querySelector('.hero').offsetHeight - innerHeight);
  await page.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), heroH * p);
  await new Promise(r => setTimeout(r, 1400));

  // hide the glyphs so we read only what sits behind them
  await page.addStyleTag({ content: '.band h1,.band h2,.band .kick,.band .sub,.band .cta{visibility:hidden!important}' });
  const box = await page.evaluate(i => {
    const b = document.querySelectorAll('.band')[i].getBoundingClientRect();
    return { x: Math.round(b.x + scrollX), y: Math.round(b.y + scrollY), width: Math.round(b.width), height: Math.round(b.height) };
  }, idx);
  console.log('box', JSON.stringify(box));

  const buf = await page.screenshot({ clip: box });
  await page.setContent('<canvas id=c></canvas>');
  const hot = await page.evaluate(async (bytes, w, h) => {
    const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
    const bmp = await createImageBitmap(blob);
    const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
    const cx = cv.getContext('2d'); cx.drawImage(bmp, 0, 0);
    const d = cx.getImageData(0, 0, cv.width, cv.height).data;
    const L = (r, g, b) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    let best = 0, bx = 0, by = 0, px = [0, 0, 0];
    // also bucket by ninths so we can see which region is the offender
    const cells = Array.from({ length: 9 }, () => 0);
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      const k = (y * cv.width + x) * 4, l = L(d[k], d[k + 1], d[k + 2]);
      if (l > best) { best = l; bx = x; by = y; px = [d[k], d[k + 1], d[k + 2]]; }
      const ci = Math.min(2, (y / cv.height * 3) | 0) * 3 + Math.min(2, (x / cv.width * 3) | 0);
      if (l > cells[ci]) cells[ci] = l;
    }
    return { best, bx, by, px, w: cv.width, h: cv.height, cells: cells.map(v => +v.toFixed(3)) };
  }, [...buf], box.width, box.height);

  const lt = 0.877;
  console.log('worst pixel', JSON.stringify(hot.px), 'lum', hot.best.toFixed(4),
    'at', hot.bx + ',' + hot.by, 'of', hot.w + 'x' + hot.h,
    'ratio', (((lt + 0.05) / (hot.best + 0.05))).toFixed(2));
  console.log('ninths (rows top->bottom):');
  console.log('  ', hot.cells.slice(0, 3).join('  '));
  console.log('  ', hot.cells.slice(3, 6).join('  '));
  console.log('  ', hot.cells.slice(6, 9).join('  '));
  await browser.close();
})();
