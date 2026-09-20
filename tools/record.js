// Record the landing-page scroll story as it actually renders.
// node tools/record.js <outdir> [seconds]
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const outdir = process.argv[2] || 'review/rec';
const secs = +(process.argv[3] || 14);

(async () => {
  fs.rmSync(outdir, { recursive: true, force: true });
  fs.mkdirSync(outdir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1',
           '--hide-scrollbars', '--font-render-hinting=none'],
    defaultViewport: { width: 1440, height: 810 },
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:8000/index.html', { waitUntil: 'networkidle2' });

  // wait for the footage to finish streaming, so the recording never shows the loading ring
  await page.waitForFunction(() => document.querySelector('#stage').classList.contains('video-ready'),
    { timeout: 60000 });
  await new Promise(r => setTimeout(r, 1800));

  const cdp = await page.target().createCDPSession();
  const frames = [];
  cdp.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
    frames.push({ data, t: metadata.timestamp });
    try { await cdp.send('Page.screencastFrameAck', { sessionId }); } catch (_) {}
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });

  // One pass down through the pinned hero, paced for reading rather than at a constant
  // rate: a short beat on the opening line, a brisk run through the two setup captions,
  // then the melt itself drawn out over the longest stretch of the run, because that is
  // the thing worth watching. Keys are [fraction of the run, hero progress].
  await page.evaluate(ms => new Promise(done => {
    const hero = document.querySelector('.hero');
    const heroEnd = hero.offsetHeight - innerHeight;
    const end = heroEnd + innerHeight * 0.75;
    const heroFrac = heroEnd / end;
    const P = [[0, 0], [0.04, 0], [0.17, 0.24], [0.26, 0.33], [0.70, 0.78], [0.82, 1], [0.89, 1]];
    const KEYS = P.map(([t, p]) => [t, p * heroFrac]).concat([[1, 1]]);
    const t0 = performance.now();
    (function step(now) {
      const p = Math.min(1, (now - t0) / ms);
      let v = 1;
      for (let i = 1; i < KEYS.length; i++) {
        if (p <= KEYS[i][0]) {
          const [p0, v0] = KEYS[i - 1], [p1, v1] = KEYS[i];
          v = v0 + (v1 - v0) * (p - p0) / (p1 - p0);
          break;
        }
      }
      // the page sets scroll-behavior: smooth for its anchor links, which would
      // re-target this every frame and leave the page parked at the top
      scrollTo({ top: end * v, behavior: 'instant' });
      p < 1 ? requestAnimationFrame(step) : setTimeout(done, 1200);
    })(t0);
  }), secs * 1000);

  await cdp.send('Page.stopScreencast');
  await browser.close();

  // write the frames and a concat list that honours their real timestamps
  const t0 = frames[0].t;
  let list = '';
  frames.forEach((f, i) => {
    const name = `f${String(i).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(outdir, name), Buffer.from(f.data, 'base64'));
    const next = frames[i + 1] ? frames[i + 1].t : f.t + 0.04;
    list += `file '${name}'\nduration ${Math.max(0.016, next - f.t).toFixed(4)}\n`;
  });
  list += `file 'f${String(frames.length - 1).padStart(5, '0')}.jpg'\n`;
  fs.writeFileSync(path.join(outdir, 'list.txt'), list);
  console.log('frames', frames.length, 'span', (frames[frames.length - 1].t - t0).toFixed(1) + 's');
})();
