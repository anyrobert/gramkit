# Gramkit for Instagram

Instagram on the web has no speed control, no seek bar, no volume slider, and no keyboard shortcuts, and it mutes every video again as you scroll. Gramkit adds all of that, plus a few switches that keep Instagram on the people you follow.

Works in Chrome (and other Chromium browsers) and in Zen and Firefox, from one shared codebase.

<p>
  <img src="docs/popup.png" width="260" alt="Popup with the speed deck, video and focus settings">
  <img src="docs/bar.png" width="260" alt="Control bar on a reel">
</p>

## Features

**Video**

- **Speed, 0.25× to 4×.** `>` and `<` step it, `Shift+R` resets, and the popup has presets. It sticks across videos, reloads and tabs. Optionally keep a separate speed for the feed, Reels and Stories.
- **Control bar** on hover: play/pause, time, a draggable seek bar with buffered range and time preview, speed menu (scroll on it to step), volume, picture-in-picture, fullscreen.
- **Sound that stays put.** *Remember* keeps whatever you last chose, including with Instagram's own speaker button. *Always on* unmutes every video. *Instagram* leaves sound alone. Your volume level is kept either way.

**Keyboard shortcuts** (YouTube-style, all rebindable)

| Key | Action |
|---|---|
| `K` / `Space` | Play / pause |
| `J` / `L` | Back / forward 10 s |
| `←` / `→` | Back / forward 5 s |
| `0`–`9` | Jump to 0–90% |
| `>` / `<` | Faster / slower |
| `Shift+R` | Normal speed |
| `M` | Mute |
| `↑` / `↓` | Volume |
| `F` / `P` | Fullscreen / picture-in-picture |
| `?` | Shortcut overlay |

Shortcuts never fire while you type in messages, comments or search. Arrow keys and Space act on a video only while the pointer is over it, so they still scroll the feed and move through posts. On Reels, `↑`/`↓` still move between reels, and in Stories the arrows stay Instagram's.

**Focus**

- Open the **Following** feed (people you follow, newest first) instead of Home.
- Hide **Reels** and **Explore**: the tabs go, and their feeds send you home. A single reel someone sends you still opens.
- Hide **suggested accounts**.

No tracking, no account, no network requests. Settings sync through your browser; Gramkit only runs on instagram.com.

## Install

Build it (below), or take the archives from `dist/`.

### Chrome, Edge, Brave, Arc

1. Unzip `gramkit-chrome-<version>.zip`.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the unzipped folder.

### Zen, Firefox

1. Open `about:config` and set `xpinstall.signatures.required` to `false` (Zen, Firefox Developer Edition, Nightly), or sign the build as below.
2. Open `about:addons`, click the gear, choose **Install Add-on From File…** and pick `gramkit-firefox-<version>.xpi`.
3. Allow it on instagram.com when asked.

```sh
npx web-ext sign --source-dir dist/firefox --channel unlisted --api-key "$AMO_JWT_ISSUER" --api-secret "$AMO_JWT_SECRET"
```

## Limits

- Firefox has no picture-in-picture API for extensions; `P` points you to Firefox's own PiP button instead.
- In fullscreen the browser's own controls replace the bar, since nothing can draw over a fullscreen video.
- Instagram changes its web app often. Gramkit avoids its generated class names and relies on routes (`/reels/`, `/explore/people/`), `<video>` elements and media events, which change far less. Checked against live instagram.com in October 2026.

## How it works

One content script, `src/content/`, runs at `document_start`:

- **`media.ts`** listens for media events (`play`, `ratechange`, `volumechange`…) in the capture phase on the document. Media events don't bubble, but they do pass through capture, so every `<video>` is covered without wiring each one. When Instagram resets the speed or re-mutes a recycled video, the event fires and the setting goes back. A change counts as the user's own when the last click landed on that video (Instagram's speaker button, its slider) or native controls are in use; then it is kept.
- **`videos.ts`** picks the video to act on from the pointer position and each video's on-screen rectangle. Instagram lays transparent overlays over its videos, so hit-testing would find the overlay. A video counts as hovered only if what's on top at the pointer shares a close ancestor with it, which rules out sign-up dialogs, backdrops and menus.
- **`hud.ts`, `controls.ts`** draw the bar, toasts and shortcut overlay in a shadow root attached to `<html>`, outside Instagram's React tree. The bar follows the hovered video's rectangle every frame instead of being inserted into Instagram's markup.
- **`shortcuts.ts`** is one capture-phase `keydown` listener that resolves keys through the keymap in `src/shared/actions.ts`. It only swallows a key when it acted on it.
- **`focus.ts`** toggles attributes on `<html>` that a small stylesheet keys off, watches the URL (Instagram navigates with `pushState` from a JavaScript world content scripts can't hook) and finds "Suggested for you" blocks from their `/explore/people/` link, which works in every language.

Preferences live in `storage.sync`; live playback state (speed, volume) in `storage.local`, so a volume drag doesn't hit sync quotas.

## Develop

```sh
npm install
npm run build        # dist/chrome, dist/firefox and their .zip / .xpi
npm run watch        # rebuild on change
npm run typecheck
npm run lint         # web-ext lint on the Firefox build
npm run icons        # re-render icons from src/static/icons/icon.svg (uses Chrome)
npm start            # Zen with the extension in a temporary profile
npm run start:chrome # Chrome, same
```

`scripts/build.mjs` bundles `src/` with esbuild and writes each browser's manifest; Chrome gets a service worker, Firefox an event page. Everything else is shared.

### Tests

```sh
npm run e2e                     # Chrome: 42 checks
npm run e2e -- --browser=zen    # Zen: the 31 that don't change settings
node test/live.mjs [reel URL]   # smoke check on live instagram.com, logged out
```

`test/e2e.mjs` loads the built extension in a real browser and answers every `www.instagram.com` request with `test/fixture.html`, a page shaped like Instagram: blob video sources, transparent overlays, a speaker button that flips mute, and play/pause by visibility. It covers speed, sound, seeking, shortcuts, typing safety, the bar, rebinding, the focus switches, the master switch, the popup and the options page. Screenshots go to `dist/screenshots/`.
