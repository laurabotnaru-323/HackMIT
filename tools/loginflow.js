// Walk the prototype login the way a visitor does, with nothing seeded.
// node tools/loginflow.js
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto('http://localhost:8000/index.html', { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.clear());

  // the dashboard must not be reachable without a session
  await page.goto('http://localhost:8000/dashboard.html', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 900));
  console.log('gate:', new URL(page.url()).pathname.endsWith('index.html')
    ? 'redirected to the landing page as expected' : 'LEAK: ' + page.url());

  await page.goto('http://localhost:8000/index.html', { waitUntil: 'networkidle2' });
  await page.evaluate(() => document.querySelector('[data-login]').click());
  await new Promise(r => setTimeout(r, 700));
  await page.type('#email', 'ops@threshold.demo');
  await page.type('#password', 'anything');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
    page.evaluate(() => document.querySelector('#loginForm').requestSubmit()),
  ]);
  await new Promise(r => setTimeout(r, 1600));

  const state = await page.evaluate(() => ({
    path: location.pathname,
    tabs: [...document.querySelectorAll('.tabs button, nav button')].map(b => b.id).filter(Boolean),
    site: document.querySelector('.site,.sitename')?.textContent.trim() || null,
    reduction: document.querySelector('#reductionVal,#statReduction')?.textContent.trim() || null,
  }));
  console.log('after login:', JSON.stringify(state));

  // The live feed has to actually move. The residual readout is an aggregate over the
  // whole spectrum, so per-bin noise averages out and it can legitimately sit still at
  // one decimal; the trace geometry is the honest liveness signal.
  const trace = () => page.evaluate(() =>
    [...document.querySelectorAll('#spectrum path')].map(p => p.getAttribute('d') || '').join('').length
    + ':' + [...document.querySelectorAll('#spectrum path')].map(p => (p.getAttribute('d') || '').slice(0, 80)).join('|'));
  const t1 = await trace();
  await new Promise(r => setTimeout(r, 2600));
  const t2 = await trace();
  console.log('spectrum live:', t1 !== t2 ? 'yes, trace redrawing' : 'STATIC');
  const p1 = await page.evaluate(() => document.querySelector('#powVal')?.textContent);
  await new Promise(r => setTimeout(r, 3000));
  const p2 = await page.evaluate(() => document.querySelector('#powVal')?.textContent);
  console.log('power readout:', p1 !== p2 ? 'moving (' + p1 + ' -> ' + p2 + ')' : 'steady at ' + p1);

  console.log(errors.length ? 'CONSOLE ERRORS: ' + errors.join(' | ') : 'console clean');
  await browser.close();
})();
