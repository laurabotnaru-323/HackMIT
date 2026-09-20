// Capture a dashboard tab full-page. node tools/dash.js <tabId> <out.png> [width] [waitMs] [actions]
const puppeteer = require('puppeteer-core');
const [, , tab, out, w = '1500', waitMs = '2600', actions = ''] = process.argv;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1', '--font-render-hinting=none'],
    defaultViewport: { width: +w, height: 1000 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  // the dashboard is behind the prototype login, so seed the same session the form writes
  await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => localStorage.setItem('threshold.session',
    JSON.stringify({ email: 'ops@threshold.demo', at: Date.now(), site: 'Gainesville Enclosure 1' })));
  await page.goto('http://localhost:8000/dashboard.html', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 900));
  if (tab && tab !== '-') { await page.click('#' + tab); await new Promise(r => setTimeout(r, 600)); }
  for (const sel of actions.split(',').filter(Boolean)) {
    await page.click(sel);
    await new Promise(r => setTimeout(r, 700));
  }
  await new Promise(r => setTimeout(r, +waitMs));
  await page.screenshot({ path: out, fullPage: true });
  console.log(out, errors.length ? 'CONSOLE ERRORS: ' + errors.join(' | ') : 'console clean');
  await browser.close();
})();
