// What each action does. Shortcuts and the control bar both call these.

import { formatSpeed, stepSpeed } from '../shared/settings';
import { toast } from './hud';
import { applySpeed, currentSpeed, isMuted, setMuted, setSpeed, setVolume } from './media';
import { store } from './store';

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

function hasDuration(video: HTMLVideoElement): boolean {
  return Number.isFinite(video.duration) && video.duration > 0;
}

export function playPause(video: HTMLVideoElement): void {
  if (video.paused || video.ended) {
    void video.play().catch(() => {});
    toast('▶', video);
  } else {
    video.pause();
    toast('❚❚', video);
  }
}

export function seekTo(video: HTMLVideoElement, time: number): void {
  if (!hasDuration(video)) return;
  video.currentTime = Math.min(Math.max(time, 0), Math.max(video.duration - 0.05, 0));
}

export function seekBy(video: HTMLVideoElement, seconds: number): void {
  if (!hasDuration(video)) return;
  seekTo(video, video.currentTime + seconds);
  toast(`${seconds > 0 ? '+' : '−'}${Math.abs(seconds)}s`, video, `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`);
}

export function jumpToTenth(video: HTMLVideoElement, tenth: number): void {
  if (!hasDuration(video)) return;
  seekTo(video, (video.duration * tenth) / 10);
  toast(`${tenth * 10}%`, video, formatTime(video.currentTime));
}

export function changeSpeed(video: HTMLVideoElement | null, rate: number): void {
  setSpeed(rate);
  if (video) applySpeed(video);
  toast(formatSpeed(currentSpeed()), video, store.settings.speedPerSection ? 'this section' : undefined);
}

export function speedStep(video: HTMLVideoElement | null, direction: 1 | -1): void {
  changeSpeed(video, stepSpeed(currentSpeed(), direction));
}

export function toggleMute(video: HTMLVideoElement): void {
  const unmute = isMuted(video);
  if (unmute && video.volume === 0) setVolume(video, 0.5);
  setMuted(video, !unmute);
  toast(unmute ? `Volume ${Math.round(video.volume * 100)}%` : 'Muted', video);
}

export function volumeBy(video: HTMLVideoElement, delta: number): void {
  const from = isMuted(video) ? 0 : video.volume;
  setVolume(video, from + delta);
  toast(isMuted(video) ? 'Muted' : `Volume ${Math.round(video.volume * 100)}%`, video);
}

const controlsBefore = new WeakMap<HTMLVideoElement, boolean>();

export async function toggleFullscreen(video: HTMLVideoElement): Promise<void> {
  if (document.fullscreenElement) {
    await document.exitFullscreen().catch(() => {});
    return;
  }
  // Our bar can't draw over a fullscreen video, so the browser's own controls take over there.
  controlsBefore.set(video, video.controls);
  video.controls = true;
  const restore = () => {
    if (document.fullscreenElement === video) return;
    video.controls = controlsBefore.get(video) ?? false;
    document.removeEventListener('fullscreenchange', restore);
  };
  document.addEventListener('fullscreenchange', restore);
  try {
    await video.requestFullscreen();
  } catch {
    restore();
    toast('Fullscreen blocked', video);
  }
}

export async function togglePip(video: HTMLVideoElement): Promise<void> {
  if (!('requestPictureInPicture' in video)) {
    toast('Use Firefox’s picture-in-picture button', video);
    return;
  }
  try {
    if (document.pictureInPictureElement === video) {
      await document.exitPictureInPicture();
      return;
    }
    video.disablePictureInPicture = false;
    await video.requestPictureInPicture();
  } catch {
    toast('Picture-in-picture unavailable', video);
  }
}
