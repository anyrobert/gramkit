// End-to-end check in a real browser with the built extension loaded.
//
//   npm run e2e                          # Google Chrome (Chrome build)
//   npm run e2e -- --browser=zen         # Zen (Firefox build); settings changes are Chrome-only
//   HEADED=1 npm run e2e                 # show the browser window
//
// Every request to www.instagram.com is answered with test/fixture.html, a page
// shaped like Instagram (blob video sources, transparent overlays, a sound
// button that flips mute, play/pause by visibility). So it runs without an
// Instagram login, and checks our behaviour rather than Instagram's markup of
// the day. Screenshots land in dist/screenshots/.

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const BROWSER = arg('browser') || 'chrome';
const CHROME = BROWSER === 'chrome';
const BIN =
  process.env.BROWSER_BIN ||
  (CHROME ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/Applications/Zen.app/Contents/MacOS/zen');
const EXTENSION = path.join(ROOT, 'dist', CHROME ? 'chrome' : 'firefox');
const SHOTS = path.join(ROOT, 'dist', 'screenshots');
const CLIP = path.join(ROOT, 'dist', 'test-clip.mp4');
const FIXTURE = fs.readFileSync(path.join(ROOT, 'test', 'fixture.html'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!fs.existsSync(CLIP)) {
  execFileSync('ffmpeg', [
    '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x800:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=330',
    '-t', '40', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', CLIP,
  ]);
}
const clip = fs.readFileSync(CLIP);

// Instagram's CDN, for downloads: any .mp4 is the clip, any .jpg a 1×1 PNG.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const CDN_BASE = 'http://127.0.0.1';
const cdn = http.createServer((req, res) => {
  const video = new URL(req.url, CDN_BASE).pathname.endsWith('.mp4');
  res.writeHead(200, { 'content-type': video ? 'video/mp4' : 'image/jpeg' });
  res.end(video ? clip : PIXEL);
});
await new Promise((r) => cdn.listen(0, '127.0.0.1', r));
const CDN = `http://127.0.0.1:${cdn.address().port}`;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const pkOf = (code) => [...code].reduce((n, c) => n * 64n + BigInt(ALPHABET.indexOf(c)), 0n).toString();
const STORY_PK = '3456789012345678901';
const MEDIA = {
  [pkOf('DAbCdEfGhIj')]: { code: 'DAbCdEfGhIj', user: { username: 'alice' }, video_versions: [{ url: `${CDN}/low.mp4?x=1`, width: 320 }, { url: `${CDN}/v1.mp4?x=1`, width: 640 }] },
  [pkOf('DCbCdEfGhIj')]: {
    code: 'DCbCdEfGhIj',
    user: { username: 'carol' },
    carousel_media: [
      { image_versions2: { candidates: [{ url: `${CDN}/c1.jpg`, width: 1080 }] } },
      { image_versions2: { candidates: [{ url: `${CDN}/c2.jpg`, width: 1080 }] } },
    ],
  },
  [STORY_PK]: { pk: STORY_PK, user: { username: 'alice' }, video_versions: [{ url: `${CDN}/story.mp4`, width: 720 }] },
};

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`);
}

async function until(fn, timeoutMs = 4000) {
  const end = Date.now() + timeoutMs;
  let value;
  while (Date.now() < end) {
    // A redirect mid-check throws "Execution context was destroyed"; try again.
    value = await fn().catch(() => undefined);
    if (value) return value;
    await sleep(100);
  }
  return value;
}

const browser = await puppeteer.launch({
  executablePath: BIN,
  browser: CHROME ? 'chrome' : 'firefox',
  headless: !process.env.HEADED,
  enableExtensions: CHROME,
  defaultViewport: { width: 1280, height: 860 },
  args: CHROME ? ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] : ['--no-remote', '--new-instance'],
  ...(CHROME ? {} : { env: { ...process.env, MOZ_NO_REMOTE: '1' } }),
});

try {
  const extensionId = await browser.installExtension(EXTENSION);
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  // A request can be gone by the time it's answered (the page navigated); that's fine.
  page.on('request', (req) => void answer(req)?.catch(() => {}));
  const answer = (req) => {
    const url = new URL(req.url());
    if (url.hostname !== 'www.instagram.com') return req.continue();
    if (url.pathname === '/__gk/clip.mp4') return req.respond({ status: 200, contentType: 'video/mp4', body: clip });
    if (url.pathname === '/favicon.ico') return req.respond({ status: 404, body: '' });
    const info = /^\/api\/v1\/media\/(\d+)\/info\/$/.exec(url.pathname);
    if (info) {
      const media = req.headers()['x-ig-app-id'] && MEDIA[info[1]];
      if (!media) return req.respond({ status: 404, contentType: 'text/html', body: '<html>login</html>' });
      return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [media] }) });
    }
    return req.respond({ status: 200, contentType: 'text/html', body: FIXTURE });
  };

  let extPage = null;
  async function setSettings(patch) {
    if (!extPage) {
      extPage = await browser.newPage();
      await extPage.goto(`chrome-extension://${extensionId}/options/options.html`);
    }
    await extPage.evaluate(async (patch) => {
      const { settings } = await chrome.storage.sync.get('settings');
      await chrome.storage.sync.set({ settings: { ...settings, ...patch } });
    }, patch);
    await page.bringToFront();
    await sleep(300);
  }

  const video = (id) =>
    page.evaluate((id) => {
      const v = document.getElementById(id);
      return { rate: v.playbackRate, muted: v.muted, volume: Math.round(v.volume * 100) / 100, time: v.currentTime, duration: v.duration, paused: v.paused };
    }, id);
  const toastText = () =>
    page.evaluate(() => document.querySelector('gramkit-hud')?.shadowRoot?.querySelector('.toast-main')?.textContent ?? null);
  const center = (id) =>
    page.evaluate((id) => {
      const r = document.getElementById(id).getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, id);
  async function hover(id) {
    const c = await center(id);
    await page.mouse.move(c.x, c.y, { steps: 3 });
  }
  async function shadowBox(selector) {
    return page.evaluate((selector) => {
      const r = document.querySelector('gramkit-hud').shadowRoot.querySelector(selector).getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    }, selector);
  }
  async function scrollTo(id) {
    await page.evaluate((id) => document.getElementById(id).scrollIntoView({ block: 'center' }), id);
    await until(async () => !(await video(id)).paused);
  }
  async function press(key, { shift = false } = {}) {
    if (shift) await page.keyboard.down('Shift');
    await page.keyboard.press(key);
    if (shift) await page.keyboard.up('Shift');
    await sleep(120);
  }

  // Load ---------------------------------------------------------------------
  await page.goto('https://www.instagram.com/');
  await page.waitForFunction(() => window.fixtureReady, { timeout: 15000 });
  check('first video autoplays muted', await until(async () => {
    const v = await video('v1');
    return !v.paused && v.muted;
  }));
  await page.mouse.move(1260, 20);

  // Speed --------------------------------------------------------------------
  await press('>');
  check('> speeds up to 1.25×', (await video('v1')).rate === 1.25, await video('v1'));
  check('speed toast shows 1.25×', (await toastText()) === '1.25×', await toastText());
  await press('>');
  await press('<');
  await press('>');
  check('> < > lands on 1.5×', (await video('v1')).rate === 1.5);
  await page.evaluate(() => (document.getElementById('v1').playbackRate = 1));
  check('an Instagram reset to 1× is reverted', await until(async () => (await video('v1')).rate === 1.5));
  await press('KeyR', { shift: true });
  check('Shift+R resets to 1×', (await video('v1')).rate === 1);
  await press('>');
  await press('>');
  await page.reload();
  await page.waitForFunction(() => window.fixtureReady, { timeout: 15000 });
  check('speed survives a reload', await until(async () => {
    const v = await video('v1');
    return !v.paused && v.rate === 1.5;
  }));
  await scrollTo('v2');
  check('next video plays at the same speed', (await video('v2')).rate === 1.5);

  // Sound --------------------------------------------------------------------
  // Instagram's own sound button. Our bar covers it once the pointer arrives, so
  // press it the way a click before the bar fades in would: pointerdown on the
  // spot, then Instagram's click handler.
  await page.keyboard.press('Shift'); // a real key press counts as user activation
  await page.evaluate(() => {
    const b = document.getElementById('sound2');
    const r = b.getBoundingClientRect();
    const at = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true };
    b.dispatchEvent(new PointerEvent('pointerdown', at));
    b.click();
  });
  await sleep(250);
  const afterUnmute = await video('v2');
  check("Instagram's sound button unmutes, our 70% level is kept", !afterUnmute.muted && afterUnmute.volume === 0.7, afterUnmute);
  await scrollTo('v1');
  await sleep(200);
  const v1Sound = await video('v1');
  check('remembered: the next video starts unmuted at 70%', !v1Sound.muted && v1Sound.volume === 0.7, v1Sound);

  // The same spot with the bar showing: our mute button is there instead.
  const sound1 = await page.evaluate(() => {
    const r = document.getElementById('sound1').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(sound1.x, sound1.y, { steps: 3 });
  await until(() => page.evaluate(() => !!document.querySelector('gramkit-hud').shadowRoot.querySelector('.bar.show')));
  await sleep(250);
  await page.mouse.click(sound1.x, sound1.y);
  await sleep(150);
  check("clicking where Instagram's speaker sits mutes via our bar", (await video('v1')).muted, await video('v1'));
  await page.mouse.click(sound1.x, sound1.y);
  await sleep(150);
  check('…and unmutes again at 70%', !(await video('v1')).muted && (await video('v1')).volume === 0.7, await video('v1'));
  await page.mouse.move(1260, 20);
  await press('KeyM');
  check('M mutes', (await video('v1')).muted);
  await press('KeyM');
  check('M unmutes', !(await video('v1')).muted);

  await page.mouse.move(1260, 20);
  await press('ArrowUp');
  check('↑ without hovering a video is left to the page', (await video('v1')).volume === 0.7);
  await hover('v1');
  await press('ArrowUp');
  check('↑ over the video raises volume to 75%', (await video('v1')).volume === 0.75, await video('v1'));
  await press('ArrowDown');
  await press('ArrowDown');
  check('↓ twice lowers to 65%', (await video('v1')).volume === 0.65);

  // Seeking ------------------------------------------------------------------
  await page.evaluate(() => (document.getElementById('v1').currentTime = 5));
  await press('KeyL');
  check('L jumps +10s', Math.abs((await video('v1')).time - 15) < 1.5, (await video('v1')).time);
  await press('KeyJ');
  check('J jumps −10s', Math.abs((await video('v1')).time - 5) < 1.5, (await video('v1')).time);
  await press('ArrowRight');
  check('→ over the video jumps +5s', Math.abs((await video('v1')).time - 10) < 1.5, (await video('v1')).time);
  await press('Digit5');
  const half = await video('v1');
  check('5 jumps to 50%', Math.abs(half.time - half.duration / 2) < 1.5, half.time);
  await page.mouse.move(1260, 20);
  const before = (await video('v1')).time;
  await press('ArrowRight');
  check('→ without hovering is left to the page', Math.abs((await video('v1')).time - before) < 1.2);

  await press('KeyK');
  check('K pauses', (await video('v1')).paused);
  await press('KeyK');
  check('K plays', !(await video('v1')).paused);

  // Focus without clicking: a click would scroll the video out of view and pause it.
  await page.$eval('#search', (i) => i.focus({ preventScroll: true }));
  const beforeTyping = await video('v1');
  await page.keyboard.type('k>m');
  const typing = await video('v1');
  const typed = await page.$eval('#search', (i) => i.value);
  check(
    'typing in search triggers nothing',
    typing.paused === beforeTyping.paused && typing.rate === beforeTyping.rate && typing.muted === beforeTyping.muted && typed === 'k>m',
    { beforeTyping, typing, typed },
  );
  await page.$eval('#search', (i) => i.blur());

  // Shortcut overlay ---------------------------------------------------------------
  await press('Slash', { shift: true });
  check('? opens the shortcut overlay', await page.evaluate(() => !!document.querySelector('gramkit-hud').shadowRoot.querySelector('.help')));
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${BROWSER}-help.png`) });
  await press('Escape');
  check('Esc closes it', await page.evaluate(() => !document.querySelector('gramkit-hud').shadowRoot.querySelector('.help')));

  // Control bar -------------------------------------------------------------------
  await hover('v1');
  check('control bar shows on hover', await until(() => page.evaluate(() => !!document.querySelector('gramkit-hud').shadowRoot.querySelector('.bar.show'))));
  const bar = await shadowBox('.bar');
  const v1Box = await page.evaluate(() => document.getElementById('v1').getBoundingClientRect().toJSON());
  check('bar sits on the bottom edge of the video', Math.abs(bar.y + bar.h - v1Box.bottom) < 2 && Math.abs(bar.w - v1Box.width) < 2, { bar, v1Box });
  const speedBtn = await shadowBox('.speed');
  await page.mouse.click(speedBtn.x + speedBtn.w / 2, speedBtn.y + speedBtn.h / 2);
  await sleep(150);
  await page.screenshot({ path: path.join(SHOTS, `${BROWSER}-bar-menu.png`), clip: { x: v1Box.left, y: v1Box.top, width: v1Box.width, height: v1Box.height } });
  const two = await page.evaluate(() => {
    const item = [...document.querySelector('gramkit-hud').shadowRoot.querySelectorAll('.menu-item')].find((b) => b.textContent === '2×');
    const r = item.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(two.x, two.y);
  check('speed menu sets 2×', (await video('v1')).rate === 2);
  const track = await shadowBox('.track');
  await page.mouse.click(track.x + track.w * 0.25, track.y + track.h / 2);
  const quarter = await video('v1');
  check('clicking the track at 25% seeks there', Math.abs(quarter.time - quarter.duration * 0.25) < 1.5, quarter.time);
  await hover('v1');
  await sleep(200);
  await page.screenshot({ path: path.join(SHOTS, `${BROWSER}-bar.png`), clip: { x: v1Box.left, y: v1Box.top, width: v1Box.width, height: v1Box.height } });

  // Frames ------------------------------------------------------------------------
  await press('KeyR', { shift: true });
  if (!(await video('v1')).paused) await press('KeyK');
  await page.evaluate(() => (document.getElementById('v1').currentTime = 3));
  await sleep(150);
  const frame0 = await video('v1');
  await press('Period');
  const frame1 = await video('v1');
  await press('Comma');
  const frame2 = await video('v1');
  check(
    '. and , step one frame while paused',
    frame1.paused && Math.abs(frame1.time - frame0.time - 1 / 30) < 0.005 && Math.abs(frame2.time - frame0.time) < 0.005,
    { frame0: frame0.time, frame1: frame1.time, frame2: frame2.time },
  );

  // Posts -------------------------------------------------------------------------
  const top = (id) => page.evaluate((id) => Math.round(document.getElementById(id).getBoundingClientRect().top), id);
  const clicks = () => page.evaluate(() => window.clicks.slice());
  const label = (post, i) => page.evaluate((post, i) => document.querySelectorAll(`#${post} section.actions svg`)[i].getAttribute('aria-label'), post, i);
  await page.evaluate(() => scrollTo(0, 0));
  await page.mouse.move(1260, 20);
  await sleep(200);
  await press('KeyJ', { shift: true });
  const atNext = await until(async () => Math.abs(await top('p2')) < 3, 2500);
  await press('KeyK', { shift: true });
  const atPrev = await until(async () => Math.abs(await top('p1')) < 3, 2500);
  check('Shift+J and Shift+K move to the next and previous post', atNext && atPrev, { p2: await top('p2'), p1: await top('p1') });

  await hover('v1');
  await press('KeyL', { shift: true });
  const liked = await label('p1', 0);
  const likeToast = await toastText();
  await press('KeyL', { shift: true });
  check('Shift+L likes and unlikes the hovered post', liked === 'Unlike' && likeToast === '♥' && (await label('p1', 0)) === 'Like', { liked, likeToast });
  await press('KeyB', { shift: true });
  check('Shift+B saves it', (await label('p1', 3)) === 'Remove');
  await press('KeyB', { shift: true });
  await press('KeyC', { shift: true });
  check('Shift+C opens its comments', (await clicks()).includes('p1:Comment'), await clicks());

  await page.evaluate(() => document.getElementById('p3').scrollIntoView({ block: 'center' }));
  await hover('m3');
  await press('BracketRight');
  await press('BracketRight');
  await press('BracketLeft');
  check('] and [ move through a carousel', (await page.evaluate(() => window.slide)) === 1, await page.evaluate(() => window.slide));

  await page.evaluate(() => scrollTo(0, 0));
  await hover('v1');
  await press('KeyU', { shift: true });
  check('Shift+U opens the post author’s profile', await until(() => page.evaluate(() => location.pathname === '/alice/')));
  await page.waitForFunction(() => window.fixtureReady, { timeout: 15000 });
  await page.mouse.move(1260, 20);
  await sleep(700);

  // Go to -------------------------------------------------------------------------
  await press('KeyG');
  await press('KeyM');
  check('G then M opens Messages', await until(() => page.evaluate(() => location.pathname === '/direct/inbox/')));
  await page.waitForFunction(() => window.fixtureReady, { timeout: 15000 });
  await press('KeyG');
  await press('KeyP');
  check('G then P opens your own profile', await until(() => page.evaluate(() => location.pathname === '/me/')));
  await page.waitForFunction(() => window.fixtureReady, { timeout: 15000 });
  await press('KeyG');
  await sleep(1700);
  await press('KeyH');
  check('G then H after the sequence timed out does nothing', await page.evaluate(() => location.pathname === '/me/'));

  // Command palette ------------------------------------------------------------------
  const palette = () => page.evaluate(() => {
    const root = document.querySelector('gramkit-hud')?.shadowRoot;
    const node = root?.querySelector('.palette');
    return node ? { items: [...node.querySelectorAll('.palette-title')].map((n) => n.textContent), focused: root.activeElement?.className ?? null } : null;
  });
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyK');
  await page.keyboard.up('Control');
  await sleep(200);
  const opened = await palette();
  await page.screenshot({ path: path.join(SHOTS, `${BROWSER}-palette.png`) });
  check('Ctrl+K opens the command palette with the input focused', opened && opened.focused === 'palette-input' && opened.items.length > 30, opened && { ...opened, items: opened.items.length });
  await page.keyboard.type('alice');
  await sleep(100);
  const recent = await palette();
  check('the palette lists recently opened profiles', recent?.items.includes('@alice'), recent?.items);
  await page.keyboard.press('Escape');
  await sleep(100);
  check('Esc closes the palette', (await palette()) === null);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyK');
  await page.keyboard.up('Control');
  await sleep(200);
  await page.keyboard.type('messages');
  await page.keyboard.press('Enter');
  check('typing a page name and Enter goes there', await until(() => page.evaluate(() => location.pathname === '/direct/inbox/')));

  await page.goto('https://www.instagram.com/');
  await page.waitForFunction(() => window.fixtureReady, { timeout: 15000 });
  await until(async () => !(await video('v1')).paused);

  if (!CHROME) {
    // Firefox fetches through the page (content.fetch) and saves data: URLs via blob: URLs.
    const gramkitDir = path.join(os.homedir(), 'Downloads', 'Gramkit');
    const before = new Set(fs.existsSync(gramkitDir) ? fs.readdirSync(gramkitDir) : []);
    const fresh = () => (fs.existsSync(gramkitDir) ? fs.readdirSync(gramkitDir).filter((f) => !before.has(f) && !f.endsWith('.part')) : []);
    await hover('v1');
    await press('KeyD', { shift: true });
    check('Shift+D downloads the post', await until(async () => fresh().some((f) => f.startsWith('alice_DAbCdEfGhIj')), 8000), fresh());
    await page.evaluate(() => document.getElementById('v1').pause());
    await press('KeyS', { shift: true });
    check('Shift+S saves the frame', await until(async () => fresh().some((f) => f.startsWith('frame_')), 8000), fresh());
    for (const f of fresh()) fs.rmSync(path.join(gramkitDir, f), { force: true });
    try {
      fs.rmdirSync(gramkitDir);
    } catch {}
  }

  if (CHROME) {
    // Rebinding -------------------------------------------------------------------
    await setSettings({ keymap: { 'speed.up': ['D'] } });
    await page.mouse.move(1260, 20);
    await press('KeyR', { shift: true });
    await press('>');
    check('after rebinding, > no longer speeds up', (await video('v1')).rate === 1);
    await press('KeyD');
    check('D now speeds up', (await video('v1')).rate === 1.25);
    await setSettings({ keymap: {} });

    // Focus tools --------------------------------------------------------------
    await setSettings({ followingFeed: true, hideReels: true, hideExplore: true, hideSuggestions: true });
    check('Home redirects to the Following feed', await until(() => page.evaluate(() => location.search === '?variant=following')));
    await page.waitForFunction(() => window.fixtureReady, { timeout: 15000 });
    await sleep(300);
    const focus = await page.evaluate(() => {
      const shown = (sel) => getComputedStyle(document.querySelector(sel)).display !== 'none';
      return {
        reels: shown('a[href="/reels/"]'),
        explore: shown('a[href="/explore/"]'),
        messages: shown('a[href="/direct/inbox/"]'),
        suggestions: shown('#suggestions'),
        footer: shown('#footer'),
      };
    });
    check('Reels, Explore and suggestions hidden; Messages and footer kept', !focus.reels && !focus.explore && !focus.suggestions && focus.messages && focus.footer, focus);
    await page.goto('https://www.instagram.com/reels/');
    check('/reels/ is closed', await until(() => page.evaluate(() => location.pathname === '/' && location.search === '?variant=following')));
    await page.goto('https://www.instagram.com/explore/');
    check('/explore/ is closed', await until(() => page.evaluate(() => location.pathname === '/')));
    await page.goto('https://www.instagram.com/reel/abc123/');
    await sleep(800);
    check('a single reel shared in DMs still opens', await page.evaluate(() => location.pathname === '/reel/abc123/'));
    await page.goto('https://www.instagram.com/?variant=following');
    await page.waitForFunction(() => window.fixtureReady, { timeout: 15000 });
    await page.evaluate(() => {
      window.sameDocument = true;
      history.pushState(null, '', '/reels/DW7AKrtjQQl/');
    });
    await sleep(800);
    const openedReel = await page.evaluate(() => ({ path: location.pathname, sameDocument: window.sameDocument === true }));
    await page.evaluate(() => history.pushState(null, '', '/'));
    await sleep(800);
    const closedReel = await page.evaluate(() => ({ path: location.pathname, sameDocument: window.sameDocument === true }));
    check(
      'opening a reel from the feed and closing it never reloads the page',
      openedReel.path === '/reels/DW7AKrtjQQl/' && openedReel.sameDocument && closedReel.path === '/' && closedReel.sameDocument,
      { openedReel, closedReel },
    );

    // Video end and autoplay ---------------------------------------------------------
    await setSettings({ videoEnd: 'stop' });
    const stopped = await page.evaluate(async () => {
      const v = document.getElementById('v1');
      const loop = v.loop;
      v.currentTime = v.duration - 0.4;
      await v.play().catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));
      return { loop, paused: v.paused, nearEnd: v.currentTime > v.duration - 0.5 };
    });
    check('“Stop” turns off Instagram’s loop and stays on the last frame', !stopped.loop && stopped.paused && stopped.nearEnd, stopped);
    await setSettings({ videoEnd: 'loop' });
    check('“Loop” gives the loop back', await page.evaluate(() => document.getElementById('v1').loop));

    await setSettings({ videoEnd: 'next' });
    await page.goto('https://www.instagram.com/reels/abc/');
    await page.waitForFunction(() => window.fixtureReady, { timeout: 15000 });
    await until(async () => !(await video('v1')).paused);
    await page.evaluate(() => {
      const v = document.getElementById('v1');
      v.currentTime = v.duration - 0.3;
    });
    check('“Next” moves on to the next reel when one ends', await until(async () => !(await video('v2')).paused, 5000));
    await setSettings({ videoEnd: 'loop', autoplay: false });

    await page.goto('https://www.instagram.com/');
    await page.waitForFunction(() => window.fixtureReady, { timeout: 15000 });
    await sleep(1200);
    const held = await video('v1');
    await hover('v1');
    await press('KeyK');
    await sleep(600);
    const started = await video('v1');
    check('autoplay off: feed videos wait, K still plays', held.paused && !started.paused, { held: held.paused, started: started.paused });
    await page.evaluate(() => document.getElementById('v2').scrollIntoView({ block: 'center' }));
    await sleep(1000);
    check('autoplay off: scrolling to the next video does not start it', (await video('v2')).paused);
    await setSettings({ autoplay: true });

    // Downloads ------------------------------------------------------------------------
    // Browser.setDownloadBehavior would drop the filenames Gramkit asks for, so
    // these go to the real Downloads folder and are deleted at the end.
    const downloads = () =>
      extPage.evaluate(async () => (await chrome.downloads.search({})).map((d) => ({ name: d.filename.split(/[\\/]/).slice(-2).join('/'), state: d.state })));
    const downloaded = (name) => until(async () => (await downloads()).some((d) => d.name === name && d.state === 'complete'), 8000);

    await page.goto('https://www.instagram.com/');
    await page.waitForFunction(() => window.fixtureReady, { timeout: 15000 });
    await until(async () => !(await video('v1')).paused);
    await hover('v1');
    await press('KeyD', { shift: true });
    check('Shift+D downloads the hovered post’s video (widest version)', await downloaded('Gramkit/alice_DAbCdEfGhIj.mp4'), await downloads());

    await page.evaluate(() => document.getElementById('p3').scrollIntoView({ block: 'center' }));
    await hover('m3');
    await press('KeyD', { shift: true });
    check(
      'a carousel downloads every slide',
      (await downloaded('Gramkit/carol_DCbCdEfGhIj_1.jpg')) && (await downloaded('Gramkit/carol_DCbCdEfGhIj_2.jpg')),
      await downloads(),
    );

    await page.evaluate(() => scrollTo(0, 0));
    await hover('v1');
    await page.evaluate(() => {
      const v = document.getElementById('v1');
      v.pause();
      v.currentTime = 4;
    });
    await sleep(200);
    await press('KeyS', { shift: true });
    check('Shift+S saves the current frame as a PNG', await until(async () => (await downloads()).some((d) => /^Gramkit\/frame_.*\.png$/.test(d.name) && d.state === 'complete'), 8000), await downloads());

    const saveButton = await shadowBox('.bar .save');
    await page.mouse.click(saveButton.x + saveButton.w / 2, saveButton.y + saveButton.h / 2);
    check('the bar’s download button downloads the post', await until(async () => (await downloads()).filter((d) => d.name.startsWith('Gramkit/alice_DAbCdEfGhIj')).length >= 2, 8000));

    await page.goto(`https://www.instagram.com/stories/alice/${STORY_PK}/`);
    await page.waitForFunction(() => window.fixtureReady, { timeout: 15000 });
    await page.mouse.move(1260, 20);
    await press('KeyD', { shift: true });
    check('Shift+D in a story downloads the story', await downloaded(`Gramkit/alice_story_${STORY_PK}.mp4`), await downloads());

    await page.goto('https://www.instagram.com/p/ZZbCdEfGhIj/');
    await page.waitForFunction(() => window.fixtureReady, { timeout: 15000 });
    await page.mouse.move(1260, 20);
    // A post page: only the URL names the post.
    await page.evaluate(() => document.querySelectorAll('article').forEach((a) => a.remove()));
    await press('KeyD', { shift: true });
    check('a post the API won’t give says so', await until(async () => (await toastText())?.includes('logged in'), 3000), await toastText());

    const folders = await extPage.evaluate(async () => {
      const dirs = new Set();
      for (const d of await chrome.downloads.search({})) {
        if (d.filename) dirs.add(d.filename.replace(/[\\/][^\\/]*$/, ''));
        if (d.state === 'complete') await chrome.downloads.removeFile(d.id).catch(() => {});
        await chrome.downloads.erase({ id: d.id });
      }
      return [...dirs];
    });
    for (const dir of folders) {
      try {
        if (path.basename(dir) === 'Gramkit') fs.rmdirSync(dir);
      } catch {}
    }

    // Messages only, focus hours, time limit -------------------------------------------------
    await setSettings({ messagesOnly: true });
    await page.goto('https://www.instagram.com/');
    check('Messages only: Home opens Messages', await until(() => page.evaluate(() => location.pathname === '/direct/inbox/')));
    await page.waitForFunction(() => window.fixtureReady, { timeout: 15000 });
    const navShown = await page.evaluate(() =>
      Object.fromEntries(['/', '/reels/', '/explore/', '/direct/inbox/'].map((h) => [h, getComputedStyle(document.querySelector(`nav a[href="${h}"]`)).display !== 'none'])),
    );
    check('Messages only: Home, Reels and Explore links are gone', !navShown['/'] && !navShown['/reels/'] && !navShown['/explore/'] && navShown['/direct/inbox/'], navShown);
    await page.goto('https://www.instagram.com/reels/');
    check('Messages only: /reels/ opens Messages', await until(() => page.evaluate(() => location.pathname === '/direct/inbox/')));
    await page.goto('https://www.instagram.com/alice/');
    await sleep(800);
    check('Messages only: profiles still open', await page.evaluate(() => location.pathname === '/alice/'));
    await setSettings({ messagesOnly: false, focusHours: { on: true, from: '00:00', to: '23:59', days: [0, 1, 2, 3, 4, 5, 6] } });
    await page.goto('https://www.instagram.com/');
    check('focus hours act as Messages only', await until(() => page.evaluate(() => location.pathname === '/direct/inbox/')));
    await setSettings({ focusHours: { on: false, from: '09:00', to: '18:00', days: [1, 2, 3, 4, 5] } });

    await setSettings({ dailyLimit: 15 });
    await extPage.evaluate(async () => {
      const now = new Date();
      const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      await chrome.storage.local.set({ usage: { day, seconds: 15 * 60, snoozeUntil: 0 } });
    });
    await page.bringToFront();
    const limitShown = () => page.evaluate(() => !!document.querySelector('gramkit-hud')?.shadowRoot?.querySelector('.limit'));
    await sleep(1500);
    check('the time limit leaves Messages alone', !(await limitShown()));
    await page.goto('https://www.instagram.com/');
    await page.waitForFunction(() => window.fixtureReady, { timeout: 15000 });
    check('over the daily limit, a full-screen card covers Instagram', await until(limitShown, 3000));
    await sleep(1200);
    check('…and videos stay paused under it', (await video('v1')).paused);
    await page.screenshot({ path: path.join(SHOTS, 'limit.png') });
    await page.evaluate(() => [...document.querySelector('gramkit-hud').shadowRoot.querySelectorAll('.limit-btn')].find((b) => !b.classList.contains('hot')).click());
    await sleep(1500);
    check('“5 more minutes” lifts it', !(await limitShown()));
    await setSettings({ dailyLimit: 0 });
    await extPage.evaluate(() => chrome.storage.local.remove('usage'));

    // Language ------------------------------------------------------------------------------
    await setSettings({ language: 'pt' });
    await page.mouse.move(1260, 20);
    await press('?');
    const ptHelp = await page.evaluate(() => document.querySelector('gramkit-hud').shadowRoot.querySelector('.help h2')?.textContent);
    await page.keyboard.press('Escape');
    check('Portuguese: the shortcut overlay is translated', ptHelp === 'Atalhos de teclado', ptHelp);
    const ptOptions = await browser.newPage();
    await ptOptions.goto(`chrome-extension://${extensionId}/options/options.html`);
    await sleep(500);
    const ptText = await ptOptions.evaluate(() => ({
      title: document.querySelector('#shortcuts-title').textContent,
      lang: document.documentElement.lang,
      group: document.querySelector('.km-group h3').textContent,
    }));
    await ptOptions.screenshot({ path: path.join(SHOTS, 'options-pt.png'), fullPage: true });
    await ptOptions.close();
    check('Portuguese: the options page is translated', ptText.title === 'Atalhos de teclado' && ptText.lang === 'pt-BR' && ptText.group === 'Reprodução', ptText);
    await setSettings({ language: 'en' });

    // Master switch -------------------------------------------------------------
    await page.goto('https://www.instagram.com/?variant=following');
    await page.waitForFunction(() => window.fixtureReady, { timeout: 15000 });
    await until(async () => !(await video('v1')).paused);
    await setSettings({ enabled: false });
    const off = await video('v1');
    await press('>');
    const offAfter = await video('v1');
    const reelsShown = await page.evaluate(() => getComputedStyle(document.querySelector('a[href="/reels/"]')).display !== 'none');
    check('turning Gramkit off restores 1×, frees keys and unhides tabs', off.rate === 1 && offAfter.rate === 1 && reelsShown, { off, offAfter, reelsShown });
    await setSettings({ enabled: true, followingFeed: false, hideReels: false, hideExplore: false, hideSuggestions: false });

    // Extension pages -----------------------------------------------------------
    const popup = await browser.newPage();
    await popup.setViewport({ width: 348, height: 640, deviceScaleFactor: 2 });
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await sleep(500);
    const readout = () => popup.$eval('#readout', (o) => Number(o.firstChild.textContent));
    const fromRate = await readout();
    await popup.click('#faster');
    await sleep(200);
    const toRate = await readout();
    check('popup + steps the speed up', toRate > fromRate, { fromRate, toRate });
    await page.bringToFront();
    check('the open Instagram tab follows the popup', await until(async () => (await video('v1')).rate === toRate));
    // Chrome doesn't paint background tabs, and a screenshot of one never finishes.
    await popup.bringToFront();
    await sleep(300);
    const body = await popup.$('main');
    await body.screenshot({ path: path.join(SHOTS, 'popup.png') });

    const options = await browser.newPage();
    await options.setViewport({ width: 1180, height: 900, deviceScaleFactor: 2 });
    await options.goto(`chrome-extension://${extensionId}/options/options.html`);
    await sleep(700);
    const add = await options.$('.km-row .add');
    await add.click();
    await sleep(100);
    await options.keyboard.down('Shift');
    await options.keyboard.press('KeyP');
    await options.keyboard.up('Shift');
    await sleep(1800);
    const stored = await options.evaluate(async () => (await chrome.storage.sync.get('settings')).settings.keymap);
    check('options page records a new shortcut', JSON.stringify(stored['video.playPause']) === JSON.stringify(['K', 'Space', 'Shift+P']), stored);
    await options.screenshot({ path: path.join(SHOTS, 'options.png'), fullPage: true });
    await options.$$eval('.km-row', (rows) => rows.find((r) => r.querySelector('.km-label').textContent === 'Mute / unmute').querySelector('.add').click());
    await sleep(100);
    await options.keyboard.press('KeyG');
    await options.keyboard.press('KeyX');
    await sleep(300);
    const sequence = await options.evaluate(async () => (await chrome.storage.sync.get('settings')).settings.keymap['sound.mute']);
    check('options page records a sequence (G then X)', JSON.stringify(sequence) === JSON.stringify(['M', 'G X']), sequence);
    await options.evaluate(async () => {
      const { settings } = await chrome.storage.sync.get('settings');
      await chrome.storage.sync.set({ settings: { ...settings, keymap: {} } });
    });

    await options.$eval('.km-row .add', (b) => b.click());
    await sleep(100);
    await options.keyboard.press('Tab');
    await options.keyboard.press('Enter');
    await sleep(200);
    const afterReserved = await options.evaluate(async () => ({
      keymap: (await chrome.storage.sync.get('settings')).settings.keymap,
      capturing: !!document.querySelector('.capture'),
    }));
    check('Tab and Enter cannot be bound', Object.keys(afterReserved.keymap).length === 0 && afterReserved.capturing, afterReserved);
    await options.keyboard.press('Escape');

    // Hostile input ---------------------------------------------------------------
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    const writeStorage = (area, value) => extPage.evaluate((area, value) => chrome.storage[area].set(value), area, value);

    await writeStorage('sync', { settings: { enabled: 'false', audioMode: 'loud', keymap: { 'video.forward10': 5, 'speed.up': null, 'not.real': ['Q'], 'speed.down': ['<'.repeat(300)] } } });
    await writeStorage('local', { playback: { speed: null, speeds: { feed: '2' }, volume: 2, muted: 'no' } });
    await page.bringToFront();
    await page.goto('https://www.instagram.com/');
    await page.waitForFunction(() => window.fixtureReady, { timeout: 15000 });
    await until(async () => !(await video('v1')).paused);
    await hover('v1');
    const corruptBar = await until(() => page.evaluate(() => !!document.querySelector('gramkit-hud').shadowRoot.querySelector('.bar.show')));
    await page.evaluate(() => (document.getElementById('v1').currentTime = 2));
    await press('KeyL');
    await press('>');
    const corrupt = await video('v1');
    check(
      'corrupt storage falls back to defaults and nothing throws',
      corruptBar && corrupt.rate === 1.25 && corrupt.time > 10 && pageErrors.length === 0,
      { corruptBar, corrupt, pageErrors: pageErrors.slice(0, 2) },
    );
    const corruptOptions = await browser.newPage();
    const optionErrors = [];
    corruptOptions.on('pageerror', (e) => optionErrors.push(e.message));
    await corruptOptions.goto(`chrome-extension://${extensionId}/options/options.html`);
    await sleep(500);
    const optionRows = await corruptOptions.$$eval('.km-row', (rows) => rows.length);
    check('options page renders with corrupt storage', optionErrors.length === 0 && optionRows > 10, { optionErrors, optionRows });
    await corruptOptions.close();
    await writeStorage('sync', { settings: {} });
    await writeStorage('local', { playback: {} });

    await page.bringToFront();
    await page.goto('https://www.instagram.com/reels/abc/');
    await page.waitForFunction(() => window.fixtureReady, { timeout: 15000 });
    await page.keyboard.press('Shift');
    await hover('v1');
    await press('>');
    await press('>');
    const reelRates = [];
    for (let i = 0; i < 8; i++) {
      reelRates.push(
        await page.evaluate(async () => {
          const v = document.getElementById('v1');
          const src = v.src;
          v.src = '';
          v.src = src;
          await new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true }));
          await v.play().catch(() => {});
          v.playbackRate = 1;
          v.muted = true;
          v.volume = 1;
          await new Promise((r) => setTimeout(r, 60));
          return v.playbackRate;
        }),
      );
    }
    check('speed sticks through 8 fast reel changes on one reused <video>', reelRates.every((r) => r === 1.5), reelRates);

    const fight = await page.evaluate(async () => {
      const v = document.getElementById('v1');
      const id = setInterval(() => (v.playbackRate = 1), 50);
      await new Promise((r) => setTimeout(r, 1500));
      clearInterval(id);
      const during = v.playbackRate;
      await new Promise((r) => setTimeout(r, 5000));
      return { during, after: v.playbackRate };
    });
    check('when Instagram stops fighting the speed, it comes back on its own', fight.during === 1 && fight.after === 1.5, fight);

    const ime = await page.evaluate(async () => {
      const v = document.getElementById('v1');
      const played = await v.play().then(() => 'ok', (e) => e.message);
      const pausedBefore = v.paused;
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Process', code: 'KeyK', keyCode: 229, bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 100));
      return { played, pausedBefore, paused: v.paused };
    });
    check('an IME keydown on the K key does not pause', !ime.pausedBefore && !ime.paused, ime);

    await page.evaluate(() => {
      const host = document.createElement('div');
      const root = host.attachShadow({ mode: 'closed' });
      root.innerHTML = '<input placeholder="closed shadow input">';
      document.querySelector('main').prepend(host);
      root.querySelector('input').focus({ preventScroll: true });
    });
    const beforeShadow = await video('v1');
    await page.keyboard.type('k>m');
    const afterShadow = await video('v1');
    check(
      'typing in an input inside a closed shadow root triggers nothing',
      afterShadow.paused === beforeShadow.paused && afterShadow.rate === beforeShadow.rate && afterShadow.muted === beforeShadow.muted,
      { beforeShadow, afterShadow },
    );
  }
} finally {
  await browser.close();
  cdn.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? `; failed: ${failed.map((f) => f.name).join(', ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
