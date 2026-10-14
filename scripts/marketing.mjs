// Renders the marketing assets with the real extension running on a staged,
// Instagram-like page (marketing/stage.html) and a sample reel we own
// (marketing/clip.html). Everything lands in dist/marketing/:
//
//   store/screenshot-1…5.png   Chrome Web Store / AMO screenshots, 1280×800
//   store/store-icon-128.png   128×128 store icon (96×96 art, 16 px transparent padding)
//   store/promo-small.png      440×280 small promo tile
//   store/promo-marquee.png    1400×560 marquee
//   demo.gif                   README / landing GIF
//   vertical.mp4               1080×1920 demo for TikTok, Reels, Shorts
//
//   npm run marketing                       # everything (builds the extension first)
//   npm run marketing -- --only=vertical    # one step: clips, shots, vertical, gif, compose
//   HEADED=1 npm run marketing              # watch it happen

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'marketing');
const RAW = path.join(OUT, 'raw');
const STORE = path.join(OUT, 'store');
const CLIPS = path.join(OUT, 'clips');
const CHROME = process.env.BROWSER_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]?.split(',');
const runs = (step) => !ONLY || ONLY.includes(step);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HOOK = 'Instagram finally has a <em>speed button</em>';

for (const dir of [RAW, STORE, CLIPS]) fs.mkdirSync(dir, { recursive: true });
execFileSync('node', [path.join(ROOT, 'scripts', 'build.mjs')], { stdio: 'inherit' });

const FILES = {
  '/__gk/font/bricolage-latin.woff2': ['font/woff2', path.join(ROOT, 'src/static/fonts/bricolage-latin.woff2')],
  '/__gk/font/jetbrains-mono-latin.woff2': ['font/woff2', path.join(ROOT, 'src/static/fonts/jetbrains-mono-latin.woff2')],
  '/__gk/icon.svg': ['image/svg+xml', path.join(ROOT, 'src/static/icons/icon.svg')],
  '/__gk/clip-brew.mp4': ['video/mp4', path.join(CLIPS, 'clip-brew.mp4')],
  '/__gk/clip-stretch.mp4': ['video/mp4', path.join(CLIPS, 'clip-stretch.mp4')],
};

/** Answers every request to `host` from FILES, else with `page`. */
async function serve(page, host, html) {
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.hostname !== host) return void req.continue().catch(() => {});
    const file = FILES[url.pathname];
    const reply = file
      ? { status: 200, contentType: file[0], body: fs.readFileSync(file[1]) }
      : url.pathname === '/favicon.ico'
        ? { status: 404, body: '' }
        : { status: 200, contentType: 'text/html', body: html };
    void req.respond(reply).catch(() => {});
  });
}

// Clips -------------------------------------------------------------------------------------

async function renderClip(theme) {
  const out = path.join(CLIPS, `clip-${theme}.mp4`);
  if (fs.existsSync(out) && !ONLY?.includes('clips')) return;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 540, height: 960, deviceScaleFactor: 2 });
  await serve(page, 'clip.local', fs.readFileSync(path.join(ROOT, 'marketing', 'clip.html')));
  await page.goto(`https://clip.local/?theme=${theme}`);
  await page.evaluate(() => document.fonts.ready);
  const duration = await page.evaluate(() => window.DURATION);
  const fps = 30;
  const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', out]);
  const frames = Math.round(duration * fps);
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.render(t), i / fps);
    const jpeg = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ffmpeg.stdin.write(jpeg)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
    if (i % 60 === 0) process.stdout.write(`\r${theme}: ${i}/${frames} frames`);
  }
  ffmpeg.stdin.end();
  await new Promise((r, j) => ffmpeg.on('close', (code) => (code ? j(new Error(`ffmpeg ${code}`)) : r())));
  console.log(`\r${theme}: ${frames} frames → ${path.relative(ROOT, out)}`);
  await browser.close();
}

if (runs('clips') || !fs.existsSync(FILES['/__gk/clip-brew.mp4'][1]) || !fs.existsSync(FILES['/__gk/clip-stretch.mp4'][1])) {
  await renderClip('brew');
  await renderClip('stretch');
}

// The extension on the stage --------------------------------------------------------------------

const STAGE = fs.readFileSync(path.join(ROOT, 'marketing', 'stage.html'));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: !process.env.HEADED,
  enableExtensions: true,
  args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', '--force-device-scale-factor=2'],
});
const extensionId = await browser.installExtension(path.join(ROOT, 'dist', 'chrome'));
const extPage = await browser.newPage();
await extPage.goto(`chrome-extension://${extensionId}/options/options.html`);
const storage = (area, value) => extPage.evaluate((area, value) => chrome.storage[area].set(value), area, value);

async function stagePage(layout, width, height, scale) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: scale });
  await serve(page, 'www.instagram.com', STAGE);
  await page.goto(`https://www.instagram.com/?layout=${layout}`);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await window.stageReady;
  });
  await sleep(800);
  return page;
}

const hud = (page, selector) =>
  page.evaluate((selector) => {
    const r = document.querySelector('gramkit-hud')?.shadowRoot?.querySelector(selector)?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, width: r.width, height: r.height } : null;
  }, selector);
const rect = (page, selector) =>
  page.evaluate((selector) => {
    const r = document.querySelector(selector).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, width: r.width, height: r.height };
  }, selector);

async function key(page, combo, label = combo) {
  await page.evaluate((label) => window.stage.key(...[].concat(label)), label);
  const parts = combo.split('+');
  for (const p of parts.slice(0, -1)) await page.keyboard.down(p);
  await page.keyboard.press(parts.at(-1));
  for (const p of parts.slice(0, -1).reverse()) await page.keyboard.up(p);
}

async function glide(page, from, to, ms) {
  const steps = Math.max(2, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
    await sleep(ms / steps);
  }
}

/**
 * Records the page with CDP screencast frames and their real timestamps.
 * (Puppeteer's own recorder rounds each gap to whole frames, so its time drifts.)
 * `stop()` writes `out` with ffmpeg, holding every frame for exactly as long as it was on screen.
 */
async function record(page, name) {
  const dir = path.join(RAW, `${name}-frames`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir);
  const client = await page.createCDPSession();
  const frames = [];
  const writes = [];
  let stopped = false;
  client.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    if (stopped) return;
    void client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    const file = path.join(dir, `${String(frames.length).padStart(5, '0')}.jpg`);
    frames.push({ file, at: metadata.timestamp });
    writes.push(fs.promises.writeFile(file, Buffer.from(data, 'base64')));
  });
  await client.send('Page.startScreencast', { format: 'jpeg', quality: 95, everyNthFrame: 1 });
  while (!frames.length) await sleep(10);
  return {
    async stop(out, filters) {
      const end = Date.now() / 1000;
      stopped = true;
      await client.send('Page.stopScreencast');
      console.log(`${name}: ${frames.length} frames, ${(end - frames[0].at).toFixed(2)}s`);
      await Promise.all(writes);
      const fps = 30;
      const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
        ...filters(frames[0].file), out], { stdio: ['pipe', 'inherit', 'inherit'] });
      const done = new Promise((r, j) => ffmpeg.on('close', (code) => (code ? j(new Error(`ffmpeg ${code}`)) : r())));
      const ticks = Math.round((end - frames[0].at) * fps);
      for (let i = 0, f = 0; i < ticks; i++) {
        const t = frames[0].at + i / fps;
        while (frames[f + 1] && frames[f + 1].at <= t) f++;
        if (!ffmpeg.stdin.write(fs.readFileSync(frames[f].file))) await new Promise((r) => ffmpeg.stdin.once('drain', r));
      }
      ffmpeg.stdin.end();
      await done;
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

const sizeOf = (file) => execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]).toString().trim().split(',').map(Number);

// Store screenshots, raw ------------------------------------------------------------------------

if (runs('shots')) {
  const page = await stagePage('feed', 1280, 800, 2);
  const media = await rect(page, '#m1');
  await page.mouse.move(media.x, media.y);
  await sleep(300);
  await page.evaluate(() => (document.getElementById('v1').currentTime = 7.3));
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('>');
    await sleep(150);
  }
  await sleep(900);
  const speed = await hud(page, '.bar .speed');
  await page.mouse.click(speed.x, speed.y);
  await sleep(400);
  await page.screenshot({ path: path.join(RAW, 'hero.png') });

  await page.mouse.click(speed.x, speed.y);
  await page.mouse.move(1200, 60);
  await sleep(300);
  await page.keyboard.press('?');
  await sleep(500);
  await page.screenshot({ path: path.join(RAW, 'help.png') });
  await page.keyboard.press('Escape');

  await storage('local', { recent: ['nora.films', 'move.daily', 'tide.pool'] });
  await key(page, 'Meta+K', '⌘K');
  await sleep(300);
  await page.keyboard.type('o', { delay: 60 });
  await sleep(1100);
  await page.screenshot({ path: path.join(RAW, 'palette.png') });
  await page.keyboard.press('Escape');

  await storage('sync', { settings: { dailyLimit: 30 } });
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  await storage('local', { usage: { day, seconds: 31 * 60, snoozeUntil: 0 } });
  await page.reload();
  await page.evaluate(() => window.stageReady);
  await sleep(2500);
  await page.screenshot({ path: path.join(RAW, 'limit.png') });
  await storage('sync', { settings: {} });
  await storage('local', { usage: { day, seconds: 23 * 60, snoozeUntil: 0 } });
  await page.close();

  const popup = await browser.newPage();
  await popup.setViewport({ width: 348, height: 900, deviceScaleFactor: 2 });
  await storage('local', { playback: { speed: 2, speeds: {}, volume: 0.8, muted: false } });
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await sleep(600);
  await (await popup.$('main')).screenshot({ path: path.join(RAW, 'popup.png') });
  await popup.close();

  const options = await browser.newPage();
  await options.setViewport({ width: 1180, height: 900, deviceScaleFactor: 2 });
  await options.goto(`chrome-extension://${extensionId}/options/options.html`);
  await sleep(600);
  await options.screenshot({ path: path.join(RAW, 'options.png') });
  await options.close();
  await storage('local', { playback: {}, usage: {} });
  console.log('shots → dist/marketing/raw/');
}

// Vertical video -----------------------------------------------------------------------------------

if (runs('vertical')) {
  const page = await stagePage('vertical', 540, 960, 2);
  const reel = await rect(page, '#v1');
  const center = { x: reel.x, y: reel.y - 60 };
  await page.evaluate((hook) => window.stage.caption(hook, 'Speed, seek and volume for every video'), HOOK);
  await page.mouse.move(reel.left + 40, reel.top + 60);
  await sleep(400);
  const recorder = await record(page, 'vertical');
  const start = Date.now();
  const at = (ms) => sleep(Math.max(0, start + ms - Date.now()));

  await at(1800);
  await glide(page, { x: reel.left + 40, y: reel.top + 60 }, center, 500);
  await at(3000);
  await page.evaluate(() => window.stage.caption('Press <em>&gt;</em> to speed up', 'Up to 4×. It sticks across videos.'));
  for (const t of [3400, 4000, 4600, 5200]) {
    await at(t);
    await key(page, '>');
  }
  await at(6600);
  const speed = await hud(page, '.bar .speed');
  await glide(page, center, speed, 400);
  await page.mouse.click(speed.x, speed.y);
  await at(7300);
  await page.evaluate(() => window.stage.caption('Or pick a <em>speed</em>', '0.25× to 4× from the bar'));
  const item = await page.evaluate(() => {
    const node = [...document.querySelector('gramkit-hud').shadowRoot.querySelectorAll('.menu-item')].find((n) => n.dataset.rate === '2.5');
    const r = node.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await glide(page, speed, item, 500);
  await at(8600);
  await page.mouse.click(item.x, item.y);

  await at(9800);
  await page.evaluate(() => window.stage.caption('A real <em>seek bar</em>', 'Drag anywhere. Finally.'));
  const track = await hud(page, '.bar .track');
  const from = { x: track.left + track.width * 0.25, y: track.y };
  const to = { x: track.left + track.width * 0.8, y: track.y };
  await glide(page, item, from, 400);
  await page.mouse.down();
  await glide(page, from, to, 1300);
  await glide(page, to, { x: track.left + track.width * 0.45, y: track.y }, 700);
  await page.mouse.up();
  await glide(page, { x: track.left + track.width * 0.45, y: track.y }, center, 400);

  await at(13600);
  await page.evaluate(() => window.stage.caption('<em>J</em> and <em>L</em> skip 10 seconds', 'Keyboard shortcuts, like YouTube'));
  await at(14200);
  await key(page, 'L');
  await at(15000);
  await key(page, 'L');
  await at(15800);
  await key(page, 'J');

  await at(17200);
  await page.evaluate((hook) => window.stage.end(hook), HOOK);
  await at(20500);
  const mp4 = path.join(OUT, 'vertical.mp4');
  await recorder.stop(mp4, () => ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest',
    '-vf', 'scale=1080:1920:flags=lanczos,fps=30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-movflags', '+faststart']);
  await page.close();
  console.log(`vertical → ${path.relative(ROOT, mp4)}`);
}

// GIF ---------------------------------------------------------------------------------------------------

if (runs('gif')) {
  const page = await stagePage('feed', 1280, 800, 1);
  const media = await rect(page, '#m1');
  const crop = { x: Math.round(media.left - 70), y: Math.round(media.top - 52), width: Math.round(media.width + 140), height: Math.round(media.height + 64) };
  crop.width += crop.width % 2;
  crop.height += crop.height % 2;
  const center = { x: media.x, y: media.y - 40 };
  await page.mouse.move(media.left + 30, media.top + 40);
  const recorder = await record(page, 'demo');
  const start = Date.now();
  const at = (ms) => sleep(Math.max(0, start + ms - Date.now()));
  await glide(page, { x: media.left + 30, y: media.top + 40 }, center, 500);
  for (const t of [1000, 1500, 2000, 2500]) {
    await at(t);
    await key(page, '>');
  }
  await at(3600);
  const track = await hud(page, '.bar .track');
  const from = { x: track.left + track.width * 0.2, y: track.y };
  const to = { x: track.left + track.width * 0.7, y: track.y };
  await glide(page, center, from, 400);
  await page.mouse.down();
  await glide(page, from, to, 1100);
  await page.mouse.up();
  await glide(page, to, center, 300);
  await at(6000);
  await key(page, 'L');
  await at(6800);
  await key(page, 'J');
  await at(8200);
  const gif = path.join(OUT, 'demo.gif');
  await recorder.stop(gif, (first) => {
    const k = sizeOf(first)[0] / 1280;
    const c = [crop.width, crop.height, crop.x, crop.y].map((n) => Math.round(n * k)).join(':');
    return ['-vf', `crop=${c},fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`];
  });
  await page.close();
  console.log(`gif → ${path.relative(ROOT, gif)} (${(fs.statSync(gif).size / 1e6).toFixed(1)} MB)`);
}

await browser.close();

// Store images ------------------------------------------------------------------------------------------

if (runs('compose')) {
  const font = (file) => `data:font/woff2;base64,${fs.readFileSync(path.join(ROOT, 'src/static/fonts', file)).toString('base64')}`;
  const img = (file) => `data:image/png;base64,${fs.readFileSync(path.join(RAW, file)).toString('base64')}`;
  const icon = `data:image/svg+xml;base64,${fs.readFileSync(path.join(ROOT, 'src/static/icons/icon.svg')).toString('base64')}`;
  const CSS = `
    @font-face { font-family: B; src: url(${font('bricolage-latin.woff2')}); font-weight: 200 800; }
    @font-face { font-family: M; src: url(${font('jetbrains-mono-latin.woff2')}); font-weight: 400 700; }
    * { box-sizing: border-box; margin: 0; }
    body { overflow: hidden; color: #fff7ef; font-family: B, sans-serif;
      background: radial-gradient(70% 60% at 85% -10%, #4a1a2a 0%, transparent 60%), radial-gradient(60% 60% at -10% 110%, #2c1446 0%, transparent 60%), #0f0c0c; }
    em { font-style: normal; background: linear-gradient(100deg, #ffb547, #ff4f7b); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .window { border-radius: 14px; overflow: hidden; background: #000; box-shadow: 0 40px 100px rgb(0 0 0 / 0.65), 0 0 0 1px rgb(255 255 255 / 0.09); }
    .chrome { height: 34px; display: flex; align-items: center; gap: 8px; padding: 0 14px; background: #1d1919; }
    .chrome i { width: 11px; height: 11px; border-radius: 50%; background: #3d3434; }
    .chrome span { margin-left: 14px; padding: 4px 14px; border-radius: 7px; background: #0f0c0c; color: #8c7f78; font: 500 12px M, monospace; }
    .window img { display: block; width: 100%; }
    .brand { display: flex; align-items: center; gap: 12px; font: 700 20px B; }
    .brand img { width: 36px; height: 36px; }
  `;
  const page = await (await puppeteer.launch({ executablePath: CHROME, headless: true })).newPage();
  async function render(file, width, height, body) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><head><style>${CSS}</style></head><body style="width:${width}px;height:${height}px">${body}</body></html>`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(STORE, file) });
  }
  // The whole 1280×800 shot, scaled into a browser window under the headline.
  const shot = (title, sub, raw) => `
    <div style="padding:40px 70px 0;text-align:center">
      <h1 style="font:800 48px/1.04 B;letter-spacing:-0.025em">${title}</h1>
      <p style="margin-top:10px;font:500 20px/1.35 B;color:#c9bdb4">${sub}</p>
    </div>
    <div class="window" style="position:absolute;left:206px;width:868px;top:200px">
      <div class="chrome"><i></i><i></i><i></i><span>instagram.com</span></div>
      <img src="${img(raw)}">
    </div>`;

  await render('screenshot-1.png', 1280, 800, shot(HOOK, '0.25× to 4×, a real seek bar and a volume slider on every video', 'hero.png'));
  await render('screenshot-2.png', 1280, 800, shot('YouTube-style <em>keyboard shortcuts</em>', 'K, J, L, &gt; and &lt;, plus next post, like, save and go-to keys. All rebindable.', 'help.png'));
  await render('screenshot-3.png', 1280, 800, shot('Everything on <em>⌘K</em>', 'Every action, setting and page, and the profiles you opened lately', 'palette.png'));
  await render('screenshot-4.png', 1280, 800, shot('A time limit that <em>actually stops you</em>', 'Optional: a daily limit, focus hours, Messages only, hidden Reels', 'limit.png'));
  await render('screenshot-5.png', 1280, 800, `
    <div style="padding:46px 70px 0;text-align:center">
      <h1 style="font:800 50px/1.04 B;letter-spacing:-0.025em">Free. <em>No account. No tracking.</em></h1>
      <p style="margin-top:12px;font:500 21px/1.35 B;color:#c9bdb4">Chrome, Edge, Brave, Arc, Firefox and Zen · English and Português</p>
    </div>
    <div style="position:absolute;left:96px;top:200px;width:300px" class="window"><img src="${img('popup.png')}"></div>
    <div class="window" style="position:absolute;left:430px;right:70px;top:200px;height:640px">
      <div class="chrome"><i></i><i></i><i></i><span>Gramkit settings</span></div>
      <div style="height:100%;background:url(${img('options.png')}) left top/100% auto no-repeat"></div>
    </div>`);
  fs.copyFileSync(path.join(ROOT, 'src/static/icons/icon-128.png'), path.join(STORE, 'store-icon-128.png'));
  await render('promo-small.png', 440, 280, `
    <div style="padding:34px 34px 0">
      <div class="brand"><img src="${icon}">Gramkit</div>
      <h1 style="margin-top:26px;font:800 33px/1.05 B;letter-spacing:-0.02em">Instagram finally has a <em>speed button</em></h1>
      <p style="margin-top:12px;font:600 13px M;color:#c9bdb4">SPEED · SEEK · SHORTCUTS</p>
    </div>`);
  await render('promo-marquee.png', 1400, 560, `
    <div style="position:absolute;left:80px;top:0;bottom:0;width:520px;display:flex;flex-direction:column;justify-content:center">
      <div class="brand" style="font-size:24px"><img src="${icon}" style="width:44px;height:44px">Gramkit</div>
      <h1 style="margin-top:30px;font:800 58px/1.02 B;letter-spacing:-0.03em">${HOOK}</h1>
      <p style="margin-top:18px;font:500 21px/1.4 B;color:#c9bdb4">Speed, a seek bar, volume and keyboard shortcuts for every video. Free.</p>
    </div>
    <div class="window" style="position:absolute;left:680px;top:70px;width:780px;height:420px">
      <div class="chrome"><i></i><i></i><i></i><span>instagram.com</span></div>
      <div style="height:100%;background:url(${img('hero.png')}) 40% 96%/150% auto no-repeat"></div>
    </div>`);
  await page.browser().close();
  console.log('store images → dist/marketing/store/');
}
