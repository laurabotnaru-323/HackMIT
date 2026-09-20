// Headless capture helper for self-testing the build.
// node tools/shoot.js <url> <out.png> [width] [height] [scrollFraction] [waitMs]
const puppeteer = require('puppeteer-core');

const [, , url, out, w = '1440', h = '900', frac = '0', waitMs = '1400'] = process.argv;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1',
           '--autoplay-policy=no-user-gesture-required', '--font-render-hinting=none'],
    defaultViewport: { width: +w, height: +h },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1200));

  const f = parseFloat(frac);
  if (f > 0) {
    // Step into position so scroll-driven work runs the way a reader triggers it.
    // A "h" suffix measures the fraction through the pinned hero instead of the whole page.
    const heroMode = String(frac).endsWith('h');
    const total = await page.evaluate(h => {
      const hero = document.querySelector('.hero');
      return h && hero ? hero.offsetHeight - innerHeight : document.body.scrollHeight - innerHeight;
    }, heroMode);
    const targetY = Math.round(total * f);
    let y = 0;
    while (y < targetY) {
      y = Math.min(targetY, y + 320);
      await page.evaluate(v => scrollTo(0, v), y);
      await new Promise(r => setTimeout(r, 55));
    }
    await new Promise(r => setTimeout(r, +waitMs));
  }

  await page.screenshot({ path: out });
  console.log(out, errors.length ? 'CONSOLE ERRORS: ' + errors.join(' | ') : 'console clean');
  await browser.close();
})();
