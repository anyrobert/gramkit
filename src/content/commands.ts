// What each action does. Shortcuts and the control bar both call these.

import { api, type DownloadFile, type DownloadResult, type Message } from '../shared/browser';
import { t } from '../shared/i18n';
import { formatSpeed, stepSpeed } from '../shared/settings';
import { toast } from './hud';
import { applySpeed, currentSpeed, isMuted, setMuted, setSpeed, setVolume, userPlays } from './media';
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

export function play(video: HTMLVideoElement): void {
  userPlays.add(video);
  void video.play().catch(() => {});
}

export function playPause(video: HTMLVideoElement): void {
  if (video.paused || video.ended) {
    play(video);
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
  toast(formatSpeed(currentSpeed()), video, store.settings.speedPerSection ? t('this section') : undefined);
}

export function speedStep(video: HTMLVideoElement | null, direction: 1 | -1): void {
  changeSpeed(video, stepSpeed(currentSpeed(), direction));
}

export function toggleMute(video: HTMLVideoElement): void {
  const unmute = isMuted(video);
  if (unmute && video.volume === 0) setVolume(video, 0.5);
  setMuted(video, !unmute);
  toast(unmute ? t('Volume {n}%', { n: Math.round(video.volume * 100) }) : t('Muted'), video);
}

export function volumeBy(video: HTMLVideoElement, delta: number): void {
  const from = isMuted(video) ? 0 : video.volume;
  setVolume(video, from + delta);
  toast(isMuted(video) ? t('Muted') : t('Volume {n}%', { n: Math.round(video.volume * 100) }), video);
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
    toast(t('Fullscreen blocked'), video);
  }
}

export async function togglePip(video: HTMLVideoElement): Promise<void> {
  if (!('requestPictureInPicture' in video)) {
    toast(t('Use Firefox’s picture-in-picture button'), video);
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
    toast(t('Picture-in-picture unavailable'), video);
  }
}

/** Instagram doesn't expose the frame rate; 30 fps is what nearly all of its video uses. */
const FRAME = 1 / 30;

export function frameStep(video: HTMLVideoElement, direction: 1 | -1): void {
  if (!hasDuration(video)) return;
  if (!video.paused) video.pause();
  seekTo(video, video.currentTime + direction * FRAME);
  toast(direction > 0 ? t('Next frame') : t('Previous frame'), video, formatTime(video.currentTime));
}

export async function sendDownloads(files: DownloadFile[]): Promise<DownloadResult> {
  return (await api.runtime.sendMessage({ type: 'download', files } satisfies Message)) as DownloadResult;
}

export async function saveFrame(video: HTMLVideoElement): Promise<void> {
  if (!video.videoWidth) return;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  let url: string;
  try {
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    url = canvas.toDataURL('image/png');
  } catch {
    // A video served without CORS taints the canvas.
    toast(t('This video can’t be captured'), video);
    return;
  }
  const stamp = formatTime(video.currentTime).replaceAll(':', '-');
  const result = await sendDownloads([{ url, filename: `frame_${location.pathname.split('/').filter(Boolean).pop() ?? 'instagram'}_${stamp}.png` }]);
  toast(result.ok ? t('Frame saved') : t('Download failed'), video);
}
