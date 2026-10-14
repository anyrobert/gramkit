// Keeps every Instagram video at the user's speed and sound settings.
//
// Media events don't bubble, but they do pass through the capture phase, so one
// capturing listener on the document sees every <video> on the page without
// wiring each element. Instagram resets playbackRate and re-mutes videos as it
// recycles them; each reset fires ratechange / volumechange, and we put our
// values back unless the user caused the change.

import { sectionOf, speedFor, withSpeed, type Playback } from '../shared/settings';
import { setPlayback, store, subscribe } from './store';
import { audibleVideo, contains, pointer } from './videos';

const touched = new WeakSet<HTMLVideoElement>();
/** Per-video mute choice in "always unmute" mode. */
const muteOverride = new WeakMap<HTMLVideoElement, boolean>();
/**
 * Corrections per video, counted separately for speed and sound. When Instagram
 * keeps resetting a value, we stop correcting it for a while instead of
 * looping, then put our value back once; a new source (Instagram reuses
 * <video> elements) starts over.
 */
type Fight = { count: number; since: number; pausedUntil: number };
const fights = { rate: new WeakMap<HTMLVideoElement, Fight>(), audio: new WeakMap<HTMLVideoElement, Fight>() };
const FIGHT_WINDOW_MS = 2000;
const FIGHT_LIMIT = 8;
const FIGHT_PAUSE_MS = 5000;

const USER_INTENT_MS = 700;

/** Plays the user started through Gramkit (a key, the bar); autoplay rules let these through. */
export const userPlays = new WeakSet<HTMLVideoElement>();
/** Videos the user started at least once; Instagram may pause and resume them as they scroll. */
const startedByUser = new WeakSet<HTMLVideoElement>();
const endedAt = new WeakMap<HTMLVideoElement, { at: number; src: string }>();
const unlooped = new WeakSet<HTMLVideoElement>();

export function currentSpeed(): number {
  return speedFor(store.settings, store.playback, sectionOf(location.pathname));
}

function hasUserActivation(): boolean {
  return navigator.userActivation?.hasBeenActive ?? true;
}

function correct(video: HTMLVideoElement, kind: keyof typeof fights, apply: (video: HTMLVideoElement) => void): void {
  const now = performance.now();
  const f = fights[kind].get(video);
  if (f && now < f.pausedUntil) return;
  if (!f || now - f.since > FIGHT_WINDOW_MS) {
    fights[kind].set(video, { count: 1, since: now, pausedUntil: 0 });
  } else if (++f.count > FIGHT_LIMIT) {
    f.pausedUntil = now + FIGHT_PAUSE_MS;
    setTimeout(() => video.isConnected && apply(video), FIGHT_PAUSE_MS);
    return;
  }
  apply(video);
}

/** True when the last click landed on this video (Instagram's own sound button, its slider) or its native controls are in use. */
function userCaused(video: HTMLVideoElement): boolean {
  if (video.controls && navigator.userActivation?.isActive) return true;
  if (performance.now() - pointer.downAt > USER_INTENT_MS) return false;
  return contains(video.getBoundingClientRect(), pointer.downX, pointer.downY);
}

export function applySpeed(video: HTMLVideoElement): void {
  if (!store.settings.enabled) return;
  const rate = currentSpeed();
  touched.add(video);
  if (video.defaultPlaybackRate !== rate) video.defaultPlaybackRate = rate;
  if (video.playbackRate !== rate) video.playbackRate = rate;
}

function desiredAudio(video: HTMLVideoElement): { muted: boolean; volume: number } | null {
  const { settings, playback } = store;
  if (!settings.enabled || settings.audioMode === 'instagram') return null;
  const audible = audibleVideo();
  // Only one video should be heard; Instagram sometimes keeps a neighbour playing.
  if (audible && audible !== video && !video.paused) return { muted: true, volume: playback.volume };
  // Unmuting before the user has interacted with the page makes the browser pause the video.
  if (!hasUserActivation()) return { muted: true, volume: playback.volume };
  const muted = settings.audioMode === 'unmute' ? (muteOverride.get(video) ?? false) : playback.muted;
  return { muted, volume: playback.volume };
}

export function applyAudio(video: HTMLVideoElement): void {
  const want = desiredAudio(video);
  if (!want) return;
  touched.add(video);
  if (Math.abs(video.volume - want.volume) > 0.001) video.volume = want.volume;
  if (video.muted !== want.muted) video.muted = want.muted;
}

function onRateChange(video: HTMLVideoElement): void {
  if (!store.settings.enabled) return;
  const rate = currentSpeed();
  if (Math.abs(video.playbackRate - rate) < 0.001) return;
  // The browser's own speed menu, e.g. in native fullscreen controls.
  if (video.controls && navigator.userActivation?.isActive) {
    setSpeed(video.playbackRate);
    return;
  }
  correct(video, 'rate', applySpeed);
}

function onVolumeChange(video: HTMLVideoElement): void {
  const want = desiredAudio(video);
  if (!want) return;
  const mutedDiffers = video.muted !== want.muted;
  const volumeDiffers = Math.abs(video.volume - want.volume) > 0.001;
  if (!mutedDiffers && !volumeDiffers) return;

  if (userCaused(video)) {
    // Instagram's sound button flips `muted` (and may jump the volume to 100%):
    // take the mute choice, keep our level. A slider drag changes only the level.
    if (store.settings.audioMode === 'unmute') muteOverride.set(video, video.muted);
    const patch: Partial<Playback> = {};
    if (mutedDiffers && store.settings.audioMode === 'remember') patch.muted = video.muted;
    if (!mutedDiffers && volumeDiffers && video.volume > 0) patch.volume = video.volume;
    setPlayback(patch);
    applyAudio(video);
    return;
  }
  correct(video, 'audio', applyAudio);
}

export function setSpeed(rate: number): void {
  setPlayback(withSpeed(store.settings, store.playback, sectionOf(location.pathname), rate));
}

/** Mutes or unmutes the given video and remembers the choice the way the audio mode asks. */
export function setMuted(video: HTMLVideoElement, muted: boolean): void {
  if (store.settings.audioMode === 'remember') setPlayback({ muted });
  else if (store.settings.audioMode === 'unmute') muteOverride.set(video, muted);
  else video.muted = muted;
  applyAudio(video);
}

export function setVolume(video: HTMLVideoElement, volume: number): void {
  volume = Math.min(1, Math.max(0, Math.round(volume * 100) / 100));
  if (store.settings.audioMode === 'instagram') {
    video.volume = volume;
    if (volume > 0) video.muted = false;
    return;
  }
  const patch: Partial<Playback> = { volume };
  if (store.settings.audioMode === 'remember' && volume > 0) patch.muted = false;
  if (store.settings.audioMode === 'unmute' && volume > 0) muteOverride.set(video, false);
  setPlayback(patch);
  applyAudio(video);
}

export function isMuted(video: HTMLVideoElement): boolean {
  return video.muted || video.volume === 0;
}

function allVideos(): HTMLVideoElement[] {
  return [...document.querySelectorAll('video')];
}

export function installMedia(): void {
  const on = (type: string, fn: (video: HTMLVideoElement) => void) =>
    document.addEventListener(
      type,
      (e) => {
        if (e.target instanceof HTMLVideoElement) fn(e.target);
      },
      true,
    );

  on('loadstart', (video) => {
    fights.rate.delete(video);
    fights.audio.delete(video);
  });
  on('loadedmetadata', (video) => {
    applySpeed(video);
    applyLoop(video);
  });
  on('play', (video) => {
    applySpeed(video);
    applyAudio(video);
    applyLoop(video);
    applyAutoplay(video);
  });
  on('ended', onEnded);
  on('playing', applyAudio);
  on('ratechange', onRateChange);
  on('volumechange', onVolumeChange);

  // Videos stay muted until the first click or key press; apply sound then.
  const onFirstActivation = () => {
    const video = audibleVideo();
    if (video) applyAudio(video);
  };
  window.addEventListener('pointerdown', onFirstActivation, { capture: true, once: true });
  window.addEventListener('keydown', onFirstActivation, { capture: true, once: true });

  subscribe((prev) => {
    const { settings } = store;
    if (prev.settings.enabled && !settings.enabled) {
      for (const video of allVideos()) {
        if (!touched.has(video)) continue;
        video.defaultPlaybackRate = 1;
        video.playbackRate = 1;
      }
      return;
    }
    for (const video of allVideos()) {
      applySpeed(video);
      applyLoop(video);
      if (!video.paused) applyAudio(video);
    }
  });
}

function applyLoop(video: HTMLVideoElement): void {
  const keep = !store.settings.enabled || store.settings.videoEnd === 'loop';
  if (!keep && video.loop) {
    video.loop = false;
    unlooped.add(video);
  } else if (keep && unlooped.has(video)) {
    video.loop = true;
    unlooped.delete(video);
  }
}

function applyAutoplay(video: HTMLVideoElement): void {
  const byUser = userPlays.has(video) || userCaused(video);
  userPlays.delete(video);
  if (byUser) startedByUser.add(video);
  const { settings } = store;
  if (!settings.enabled || byUser) return;
  // Instagram restarts finished videos itself with play(). Stories reuse the
  // element for the next story, which is a new source, not a restart.
  const ended = endedAt.get(video);
  const restart = !!ended && ended.src === video.currentSrc && performance.now() - ended.at < 1000;
  if (restart && settings.videoEnd !== 'loop' && sectionOf(location.pathname) !== 'stories') {
    video.pause();
    return;
  }
  if (!settings.autoplay && sectionOf(location.pathname) === 'feed' && !startedByUser.has(video)) video.pause();
}

function onEnded(video: HTMLVideoElement): void {
  endedAt.set(video, { at: performance.now(), src: video.currentSrc });
  if (!store.settings.enabled || store.settings.videoEnd !== 'next' || sectionOf(location.pathname) !== 'reels') return;
  nextReel(video);
}

/** Scrolls to the reel after `video`; Instagram's reel list snaps to it and starts it. */
export function nextReel(video: HTMLVideoElement): void {
  const top = video.getBoundingClientRect().top;
  const next = allVideos()
    .map((v) => ({ v, top: v.getBoundingClientRect().top }))
    .filter((x) => x.top > top + 50)
    .sort((a, b) => a.top - b.top)[0]?.v;
  if (next) next.scrollIntoView({ block: 'center', behavior: 'smooth' });
  else document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
}
