// One keydown listener for every shortcut. It runs in the capture phase on
// window, ahead of Instagram's handlers, and only swallows a key when it
// actually did something with it.

import { ACTION_BY_ID, DIGITS, resolveKeymap, type ActionId } from '../shared/actions';
import { api } from '../shared/browser';
import { CONTESTED, comboFromEvent, isDigitCombo } from '../shared/keys';
import { sectionOf } from '../shared/settings';
import {
  jumpToTenth,
  playPause,
  seekBy,
  speedStep,
  changeSpeed,
  toggleFullscreen,
  toggleMute,
  togglePip,
  volumeBy,
} from './commands';
import { closeHelp, isHelpOpen, toggleHelp } from './hud';
import { store, subscribe } from './store';
import { activeVideo, hoveredVideo } from './videos';

const TEXT_INPUT =
  'input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [role=textbox], [role=combobox], [role=searchbox]';

/** Content scripts may look inside closed shadow roots: Chrome through `chrome.dom`, Firefox through a property. */
function shadowOf(el: HTMLElement): ShadowRoot | null {
  return (
    api.dom?.openOrClosedShadowRoot?.(el) ??
    (el as { openOrClosedShadowRoot?: ShadowRoot | null }).openOrClosedShadowRoot ??
    el.shadowRoot
  );
}

function isTyping(e: KeyboardEvent): boolean {
  let target = e.composedPath()[0];
  for (let depth = 0; target instanceof HTMLElement && depth < 8; depth++) {
    const inner = shadowOf(target)?.activeElement;
    if (!inner || inner === target) break;
    target = inner;
  }
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches(TEXT_INPUT);
}

/**
 * Which video a combo may act on. Arrow keys and Space also scroll the page,
 * move through carousels, reels and stories, so they only reach a video where
 * that won't take a key away from Instagram.
 */
function targetVideo(combo: string): HTMLVideoElement | null {
  if (!CONTESTED.has(combo)) return activeVideo();
  const section = sectionOf(location.pathname);
  if (section === 'stories') return null;
  if (section === 'reels') return combo === 'ArrowUp' || combo === 'ArrowDown' ? null : activeVideo();
  return hoveredVideo();
}

function run(id: ActionId, combo: string): boolean {
  if (id === 'app.help') {
    toggleHelp();
    return true;
  }
  const video = targetVideo(combo);
  if (!video) return false;
  switch (id) {
    case 'video.playPause':
      playPause(video);
      break;
    case 'video.back5':
      seekBy(video, -5);
      break;
    case 'video.forward5':
      seekBy(video, 5);
      break;
    case 'video.back10':
      seekBy(video, -10);
      break;
    case 'video.forward10':
      seekBy(video, 10);
      break;
    case 'video.jump':
      jumpToTenth(video, Number(combo));
      break;
    case 'speed.up':
      speedStep(video, 1);
      break;
    case 'speed.down':
      speedStep(video, -1);
      break;
    case 'speed.reset':
      changeSpeed(video, 1);
      break;
    case 'sound.mute':
      toggleMute(video);
      break;
    case 'sound.up':
      volumeBy(video, 0.05);
      break;
    case 'sound.down':
      volumeBy(video, -0.05);
      break;
    case 'view.fullscreen':
      void toggleFullscreen(video);
      break;
    case 'view.pip':
      void togglePip(video);
      break;
  }
  return true;
}

export function installShortcuts(): void {
  let keymap = resolveKeymap(store.settings.keymap);
  subscribe((prev) => {
    if (prev.settings.keymap !== store.settings.keymap) keymap = resolveKeymap(store.settings.keymap);
  });

  window.addEventListener(
    'keydown',
    (e) => {
      if (!store.settings.enabled || e.isComposing || isTyping(e)) return;
      const combo = comboFromEvent(e);
      if (!combo) return;

      if (isHelpOpen() && combo === 'Escape') {
        closeHelp();
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      const id = keymap.get(combo) ?? (isDigitCombo(combo) ? keymap.get(DIGITS) : undefined);
      if (!id) return;
      if (e.repeat && !ACTION_BY_ID[id].repeat) {
        // Held toggle keys: swallow the repeats if the first press was ours.
        if (id === 'app.help' || targetVideo(combo)) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        return;
      }
      if (!run(id, combo)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );
}
