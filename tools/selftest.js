// Adversarial self-test for the landing page. node tools/selftest.js
const puppeteer = require('puppeteer-core');
const URL = 'http://localhost:8000/index.html';
const launch = () => puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1'],
  defaultViewport: { width: 1440, height: 900 },
});
const wait = ms => new Promise(r => setTimeout(r, ms));
const errs = [];
const watch = (page, tag) => {
  page.on('console', m => { if (m.type() === 'error') errs.push(tag + ': ' + m.text()); });
  page.on('pageerror', e => errs.push(tag + ': ' + e));
};

// --- the flick test: every beat readable for 5 to 6 normal flicks, none skippable at 360px
async function flickTest(page, step) {
  await page.evaluate(() => scrollTo(0, 0));
  await wait(900);
  const heroH = await page.evaluate(() => document.querySelector('.hero').offsetHeight - innerHeight);
  const rows = [];
  for (let y = 0; y <= heroH; y += step) {
    await page.evaluate(v => scrollTo(0, v), y);
    await wait(400);   // a beat between flicks, like a real reader
    rows.push(await page.evaluate(() =>
      [...document.querySelectorAll('.band')].map(b => +getComputedStyle(b).opacity)));
  }
  const n = rows[0].length;
  const out = [];
  for (let b = 0; b < n; b++) {
    const full = rows.filter(r => r[b] > 0.92).length;
    const peak = Math.max(...rows.map(r => r[b]));
    out.push({ band: b + 1, fullSteps: full, peak: +peak.toFixed(2) });
  }
  return out;
}

// --- worst-frame legibility: hide the glyphs, screenshot the real composited page,
// --- find the lightest pixel under the text box. Conservative: the shadow goes too.
async function legibility(page) {
  const lum = ([r, g, b]) => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const results = [];
  const bands = await page.evaluate(() =>
    [...document.querySelectorAll('.band')].map(b => ({ a: +b.dataset.a, b: +b.dataset.b })));
  const heroH = await page.evaluate(() => document.querySelector('.hero').offsetHeight - innerHeight);

  for (let i = 0; i < bands.length; i++) {
    const { a, b } = bands[i];
    // sample across the band's plateau, not just its middle: the worst frame is the point
    for (const t of [0.25, 0.5, 0.75, 1]) {
      const p = a + (b - a) * t;
      await page.evaluate(v => scrollTo(0, v), Math.round(heroH * Math.min(p, 0.999)));
      await wait(1000);
      const box = await page.evaluate(n => {
        const el = document.querySelectorAll('.band')[n];
        const t = el.querySelector('h1,h2');
        const r = t.getBoundingClientRect();
        // screenshot clips are document coordinates, so add the scroll offset
        return { x: Math.round(Math.max(0, r.x + scrollX)), y: Math.round(Math.max(0, r.y + scrollY)),
                 width: Math.round(r.width), height: Math.round(r.height) };
      }, i);
      if (box.width < 4 || box.height < 4) continue;
      await page.evaluate(n => {
        document.querySelectorAll('.band')[n].querySelectorAll('h1,h2,.sub,.kick,.cta')
          .forEach(e => e.style.visibility = 'hidden');
      }, i);
      await wait(120);
      const buf = await page.screenshot({ clip: box });
      await page.evaluate(n => {
        document.querySelectorAll('.band')[n].querySelectorAll('h1,h2,.sub,.kick,.cta')
          .forEach(e => e.style.visibility = '');
      }, i);
      // decode the PNG with the browser itself, no extra dependency
      const worst = await page.evaluate(async data => {
        const img = await createImageBitmap(new Blob([new Uint8Array(data)], { type: 'image/png' }));
        const c = new OffscreenCanvas(img.width, img.height).getContext('2d');
        c.drawImage(img, 0, 0);
        const d = c.getImageData(0, 0, img.width, img.height).data;
        let best = [0, 0, 0], bl = -1;
        const L = (r, g, b) => {
          const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        for (let k = 0; k < d.length; k += 4) {
          const l = L(d[k], d[k + 1], d[k + 2]);
          if (l > bl) { bl = l; best = [d[k], d[k + 1], d[k + 2]]; }
        }
        return best;
      }, [...buf]);
      const lt = lum([238, 243, 239]);
      const lw = lum(worst);
      const hi = Math.max(lt, lw), lo = Math.min(lt, lw);
      results.push({ band: i + 1, at: +p.toFixed(2), ratio: +((hi + 0.05) / (lo + 0.05)).toFixed(2) });
    }
  }
  return results;
}

(async () => {
  const browser = await launch();

  // 1. flick test
  let page = await browser.newPage(); watch(page, 'flick');
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await wait(2500);
  for (const step of [120, 240, 360]) {
    console.log('flick ' + step + 'px:', JSON.stringify(await flickTest(page, step)));
  }

  // 2. worst-frame legibility
  console.log('legibility:', JSON.stringify(await legibility(page)));

  // 3. the press-and-hold, performed like a visitor
  await page.evaluate(() => document.querySelector('#hold').scrollIntoView({ block: 'center' }));
  await wait(900);
  const btn = await page.$('#holdBtn');
  const bb = await btn.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  await wait(2200);
  await page.mouse.up();
  await wait(500);
  console.log('hold:', await page.evaluate(() => ({
    readout: document.querySelector('#holdVal').textContent,
    done: document.querySelector('#hold').classList.contains('done'),
    label: document.querySelector('#holdBtn').textContent,
  })));

  // 4. reduced motion flipped ON mid-session
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await wait(900);
  console.log('reduced on:', await page.evaluate(() => ({
    p: getComputedStyle(document.querySelector('#stage')).getPropertyValue('--p').trim(),
    settleVisible: +getComputedStyle(document.querySelector('.band.b4')).opacity,
    dividersDrawn: [...document.querySelectorAll('.divider .draw')].every(d => d.style.strokeDashoffset === '0'),
  })));
  // and back OFF again
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.evaluate(() => scrollTo(0, 0));
  await wait(1400);
  console.log('reduced off again:', await page.evaluate(() => ({
    p: getComputedStyle(document.querySelector('#stage')).getPropertyValue('--p').trim(),
    band1: +getComputedStyle(document.querySelector('.band.b1')).opacity,
    band4: +getComputedStyle(document.querySelector('.band.b4')).opacity,
  })));
  await page.close();

  // 5. the video blocked at the network: the page must still be complete
  page = await browser.newPage(); watch(page, 'novideo');
  const cdp = await page.target().createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setBlockedURLs', { urls: ['*hero-scrub.mp4'] });
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await wait(4000);
  await page.evaluate(() => scrollTo(0, document.querySelector('.hero').offsetHeight - innerHeight));
  await wait(1600);
  console.log('video blocked:', await page.evaluate(() => ({
    hasVideo: document.querySelector('#stage').classList.contains('has-video'),
    drawnSceneVisible: getComputedStyle(document.querySelector('.scene .living')).display !== 'none',
    settle: +getComputedStyle(document.querySelector('.band.b4')).opacity,
  })));
  await page.screenshot({ path: 'review/shots/novideo.png' });
  await page.close();

  // 6. phone: touch emulation so (pointer: coarse) really matches
  page = await browser.newPage(); watch(page, 'phone');
  await page.emulate({
    viewport: { width: 375, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  });
  const reqs = [];
  page.on('request', r => reqs.push(r.url()));
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await wait(2500);
  console.log('phone:', {
    videoRequested: reqs.some(u => /hero-scrub\.mp4|hero-poster\.jpg/.test(u)),
    sideways: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
  });
  await page.screenshot({ path: 'review/shots/phone.png' });
  await page.close();

  console.log(errs.length ? 'CONSOLE ERRORS:\n' + errs.join('\n') : 'console clean everywhere');
  await browser.close();
})();
