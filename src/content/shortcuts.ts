// One keydown listener for every shortcut. It runs in the capture phase on
// window, ahead of Instagram's handlers, and only swallows a key when it
// actually did something with it.

import { ACTION_BY_ID, DIGITS, resolveKeymap, sequenceStarts, type ActionId } from '../shared/actions';
import { api } from '../shared/browser';
import { CONTESTED, comboFromEvent, isDigitCombo, SEQUENCE_MS } from '../shared/keys';
import { sectionOf } from '../shared/settings';
import {
  changeSpeed,
  frameStep,
  jumpToTenth,
  playPause,
  saveFrame,
  seekBy,
  speedStep,
  toggleFullscreen,
  toggleMute,
  togglePip,
  volumeBy,
} from './commands';
import { closeHelp, isHelpOpen, toggleHelp } from './hud';
import { goTo } from './nav';
import { togglePalette } from './palette';
import {
  downloadCurrent,
  openComments,
  openProfile,
  stepPost,
  stepSlide,
  toggleLike,
  toggleSave,
  toggleStoryPause,
} from './posts';
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
 * that won't take a key away from Instagram. Without a combo (the command
 * palette), the active video.
 */
function targetVideo(combo: string | null): HTMLVideoElement | null {
  if (!combo || !CONTESTED.has(combo)) return activeVideo();
  const section = sectionOf(location.pathname);
  if (section === 'stories') return null;
  if (section === 'reels') return combo === 'ArrowUp' || combo === 'ArrowDown' ? null : activeVideo();
  return hoveredVideo();
}

/** Actions that don't need a video. Returns null for video actions. */
function runPageAction(id: ActionId): boolean | null {
  switch (id) {
    case 'app.help':
      toggleHelp();
      return true;
    case 'app.palette':
      togglePalette(runAction);
      return true;
    case 'post.next':
      return stepPost(1);
    case 'post.prev':
      return stepPost(-1);
    case 'post.like':
      return toggleLike();
    case 'post.save':
      return toggleSave();
    case 'post.comments':
      return openComments();
    case 'post.profile':
      return openProfile();
    case 'post.slideNext':
      return stepSlide(1);
    case 'post.slidePrev':
      return stepSlide(-1);
    case 'post.download':
      void downloadCurrent();
      return true;
    case 'go.home':
    case 'go.messages':
    case 'go.explore':
    case 'go.reels':
    case 'go.profile':
    case 'go.saved':
    case 'go.search':
      goTo(id.slice(3) as Parameters<typeof goTo>[0]);
      return true;
    default:
      return null;
  }
}

/** Runs an action; `combo` is the key that triggered it, or null from the command palette. */
export function runAction(id: ActionId, combo: string | null = null): boolean {
  const done = runPageAction(id);
  if (done !== null) return done;
  if (id === 'video.playPause' && sectionOf(location.pathname) === 'stories' && toggleStoryPause()) return true;
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
      jumpToTenth(video, Number(combo ?? 0));
      break;
    case 'video.frameBack':
      frameStep(video, -1);
      break;
    case 'video.frameForward':
      frameStep(video, 1);
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
    case 'view.saveFrame':
      void saveFrame(video);
      break;
    default:
      return false;
  }
  return true;
}

export function installShortcuts(): void {
  let keymap = resolveKeymap(store.settings.keymap);
  let starts = sequenceStarts(keymap);
  subscribe((prev) => {
    if (prev.settings.keymap === store.settings.keymap) return;
    keymap = resolveKeymap(store.settings.keymap);
    starts = sequenceStarts(keymap);
  });
  let pending: { combo: string; at: number } | null = null;

  const swallow = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  window.addEventListener(
    'keydown',
    (e) => {
      if (!store.settings.enabled || e.isComposing || isTyping(e)) return;
      const combo = comboFromEvent(e);
      if (!combo) return;

      if (isHelpOpen() && combo === 'Escape') {
        closeHelp();
        swallow(e);
        return;
      }

      const first = pending && performance.now() - pending.at < SEQUENCE_MS ? pending.combo : null;
      pending = null;
      if (first) {
        const id = keymap.get(`${first} ${combo}`);
        if (id) {
          if (runAction(id, combo)) swallow(e);
          return;
        }
      }
      if (starts.has(combo) && !e.repeat) {
        pending = { combo, at: performance.now() };
        swallow(e);
        return;
      }

      const id = keymap.get(combo) ?? (isDigitCombo(combo) ? keymap.get(DIGITS) : undefined);
      if (!id) return;
      if (e.repeat && !ACTION_BY_ID[id].repeat) {
        // Held toggle keys: swallow the repeats if the first press was ours.
        if (id.startsWith('app.') || id.startsWith('post.') || id.startsWith('go.') || targetVideo(combo)) swallow(e);
        return;
      }
      if (runAction(id, combo)) swallow(e);
    },
    true,
  );
}
