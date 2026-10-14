// Smoke check against live instagram.com, logged out, on a public reel.
//
//   node test/live.mjs [reel URL]
//   HEADED=1 node test/live.mjs
//
// Instagram decides what a logged-out visitor sees, so this only reports what
// it finds: the videos on the page, what speed and sound they ended up with,
// and screenshots in dist/screenshots/live-*.png.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL_ = process.argv[2] || 'https://www.instagram.com/reel/DW7AKrtjQQl/';
const SHOTS = path.join(ROOT, 'dist', 'screenshots');
// Headless Chrome announces itself in the user agent; look like desktop Chrome.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: !process.env.HEADED,
  enableExtensions: true,
  defaultViewport: { width: 1280, height: 900 },
  args: ['--mute-audio', '--disable-blink-features=AutomationControlled', `--user-agent=${UA}`],
});

try {
  await browser.installExtension(path.join(ROOT, 'dist', 'chrome'));
  const page = await browser.newPage();
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('video', { timeout: 30000 }).catch(() => {});
  await sleep(4000);

  const videos = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('video')].map((v) => {
        const r = v.getBoundingClientRect();
        return {
          src: v.currentSrc.slice(0, 30),
          rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          paused: v.paused,
          rate: v.playbackRate,
          muted: v.muted,
          inDialog: !!v.closest('[role="dialog"]'),
        };
      }),
    );

  console.log('url', page.url());
  console.log('dialogs', await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].map((d) => d.textContent.slice(0, 80))));
  console.log('videos before', await videos());

  const box = await page.evaluate(() => {
    const v = [...document.querySelectorAll('video')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
    return v ? v.getBoundingClientRect().toJSON() : null;
  });
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
    await page.keyboard.press('>');
    await sleep(150);
    await page.keyboard.press('>');
    await sleep(400);
    console.log('toast', await page.evaluate(() => document.querySelector('gramkit-hud')?.shadowRoot?.querySelector('.toast-main')?.textContent));
    console.log('bar shown', await page.evaluate(() => !!document.querySelector('gramkit-hud')?.shadowRoot?.querySelector('.bar.show')));
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, 'live-reel.png') });
    await page.keyboard.press('KeyL');
    await sleep(300);

    // Close Instagram's sign-up dialog if there is one, then hover again.
    const closed = await page.evaluate(() => {
      const close = document.querySelector('[role="dialog"] svg[aria-label="Close"]')?.closest('[role="button"], button');
      close?.click();
      return !!close;
    });
    await sleep(800);
    await page.mouse.move(box.x + 20, box.y + box.height - 60, { steps: 4 });
    await sleep(400);
    console.log('dialog closed', closed, 'bar shown after', await page.evaluate(() => !!document.querySelector('gramkit-hud')?.shadowRoot?.querySelector('.bar.show')));
    await page.screenshot({ path: path.join(SHOTS, 'live-reel-open.png') });
  }
  console.log('videos after', await videos());
} finally {
  await browser.close();
}
