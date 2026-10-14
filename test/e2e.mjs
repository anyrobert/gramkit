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
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.hostname !== 'www.instagram.com') return req.continue();
    if (url.pathname === '/__gk/clip.mp4') return req.respond({ status: 200, contentType: 'video/mp4', body: clip });
    if (url.pathname === '/favicon.ico') return req.respond({ status: 404, body: '' });
    return req.respond({ status: 200, contentType: 'text/html', body: FIXTURE });
  });

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
    await sleep(300);
    const stored = await options.evaluate(async () => (await chrome.storage.sync.get('settings')).settings.keymap);
    check('options page records a new shortcut', JSON.stringify(stored['video.playPause']) === JSON.stringify(['K', 'Space', 'Shift+P']), stored);
    await options.screenshot({ path: path.join(SHOTS, 'options.png'), fullPage: true });
    await options.evaluate(async () => {
      const { settings } = await chrome.storage.sync.get('settings');
      await chrome.storage.sync.set({ settings: { ...settings, keymap: {} } });
    });
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? `; failed: ${failed.map((f) => f.name).join(', ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
