// The control bar: play, time, seek track, speed menu, volume, picture-in-picture
// and fullscreen. It floats in our shadow root and follows the hovered video's
// rectangle each frame, so nothing is inserted into Instagram's own markup.

import { t } from '../shared/i18n';
import { SPEED_STEPS, formatSpeed } from '../shared/settings';
import {
  changeSpeed,
  formatTime,
  playPause,
  seekTo,
  speedStep,
  toggleFullscreen,
  toggleMute,
  togglePip,
} from './commands';
import { el, hudRoot } from './hud';
import { currentSpeed, isMuted, setVolume } from './media';
import { downloadCurrent } from './posts';
import { store, subscribe } from './store';
import { contains, hoveredVideo, pointer } from './videos';

const BAR_HEIGHT = 40;
const IDLE_MS = 2200;
const MENU_STEPS = SPEED_STEPS.filter((s) => s >= 0.5 && s <= 3);

const ICONS = {
  play: 'M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z',
  pause: 'M7 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm7 0h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z',
  volume:
    'M3 9v6h4l5 5V4L7 9H3Zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.48 4.48 0 0 0 16.5 12ZM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54Z',
  muted:
    'M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63Zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12a9 9 0 0 0-7-8.77v2.06A7 7 0 0 1 19 12ZM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a9 9 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3ZM12 4 9.91 6.09 12 8.18V4Z',
  pip: 'M19 11h-8v6h8v-6Zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2Zm-2 .02H3V4.97h18v14.05Z',
  fullscreen: 'M7 14H5v5h5v-2H7v-3Zm-2-4h2V7h3V5H5v5Zm12 7h-3v2h5v-5h-2v3ZM14 5v2h3v3h2V5h-5Z',
  download: 'M11 4h2v8.17l3.59-3.58L18 10l-6 6-6-6 1.41-1.41L11 12.17V4Zm-6 14h14v2H5v-2Z',
};

function icon(path: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', path);
  svg.append(p);
  return svg;
}

function setIcon(button: HTMLButtonElement, path: string): void {
  const p = button.querySelector('path');
  if (p && p.getAttribute('d') !== path) p.setAttribute('d', path);
}

/** Buttons and their English labels; relabeled once the language setting loads. */
const labelled: [HTMLElement, string][] = [];

function relabel(): void {
  for (const [node, text] of labelled) {
    const label = t(text);
    node.setAttribute('aria-label', label);
    if (node instanceof HTMLButtonElement) node.title = label;
  }
}

function button(className: string, label: string, path?: string): HTMLButtonElement {
  const b = el('button', `b ${className}`);
  b.type = 'button';
  b.tabIndex = -1;
  labelled.push([b, label]);
  if (path) b.append(icon(path));
  // Keep focus on the page so shortcuts and Space keep working after a click.
  b.addEventListener('pointerdown', (e) => e.preventDefault());
  return b;
}

export function installControls(): void {
  let video: HTMLVideoElement | null = null;
  let dragging = false;
  let menuOpen = false;
  let overBar = false;
  let running = false;
  let mounted = false;

  const bar = el('div', 'bar');
  const play = button('play', 'Play / pause', ICONS.play);
  const time = el('span', 'time', '0:00');
  const track = el('div', 'track');
  const buffered = el('div', 'buffered');
  const fill = el('div', 'fill');
  const thumb = el('div', 'thumb');
  const tip = el('div', 'tip');
  track.append(buffered, fill, thumb, tip);
  const speedWrap = el('div', 'speed-wrap');
  const speed = button('speed', 'Playback speed');
  const menu = el('div', 'menu');
  menu.setAttribute('role', 'menu');
  speedWrap.append(speed, menu);
  const vol = el('div', 'vol');
  const mute = button('mute', 'Mute', ICONS.volume);
  const slider = el('input', 'slider');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.step = '1';
  slider.tabIndex = -1;
  labelled.push([slider, 'Volume']);
  vol.append(slider, mute);
  const save = button('save', 'Download', ICONS.download);
  const pip = button('pip', 'Picture-in-picture', ICONS.pip);
  const fs = button('fs', 'Fullscreen', ICONS.fullscreen);
  // Mute sits at the far right, where Instagram's own sound button is under the
  // bar, so reaching for "the speaker" still toggles sound.
  bar.append(play, time, track, speedWrap, save, pip, fs, vol);

  for (const step of MENU_STEPS) {
    const item = button('menu-item', formatSpeed(step));
    item.textContent = formatSpeed(step);
    item.dataset.rate = String(step);
    item.setAttribute('role', 'menuitemradio');
    item.addEventListener('click', () => {
      if (video) changeSpeed(video, step);
      closeMenu();
    });
    menu.append(item);
  }

  function closeMenu(): void {
    menuOpen = false;
    speedWrap.classList.remove('open');
  }

  bar.addEventListener('pointerenter', () => (overBar = true));
  bar.addEventListener('pointerleave', () => (overBar = false));
  play.addEventListener('click', () => video && playPause(video));
  mute.addEventListener('click', () => video && toggleMute(video));
  save.addEventListener('click', () => video && void downloadCurrent(video));
  pip.addEventListener('click', () => video && void togglePip(video));
  fs.addEventListener('click', () => video && void toggleFullscreen(video));
  speed.addEventListener('click', () => {
    menuOpen = !menuOpen;
    speedWrap.classList.toggle('open', menuOpen);
  });
  speed.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (video) speedStep(video, e.deltaY < 0 ? 1 : -1);
    },
    { passive: false },
  );
  slider.addEventListener('input', () => video && setVolume(video, Number(slider.value) / 100));
  slider.addEventListener('pointerdown', (e) => e.stopPropagation());

  function ratioAt(clientX: number): number {
    const r = track.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  }

  function showTip(clientX: number): void {
    if (!video || !Number.isFinite(video.duration)) return;
    const ratio = ratioAt(clientX);
    tip.textContent = formatTime(ratio * video.duration);
    tip.style.left = `${ratio * 100}%`;
  }

  track.addEventListener('pointerdown', (e) => {
    if (!video) return;
    e.preventDefault();
    dragging = true;
    track.setPointerCapture(e.pointerId);
    track.classList.add('dragging');
    seekTo(video, ratioAt(e.clientX) * video.duration);
    showTip(e.clientX);
  });
  track.addEventListener('pointermove', (e) => {
    showTip(e.clientX);
    if (dragging && video) seekTo(video, ratioAt(e.clientX) * video.duration);
  });
  const endDrag = () => {
    dragging = false;
    track.classList.remove('dragging');
  };
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);

  function shouldShow(target: HTMLVideoElement | null): target is HTMLVideoElement {
    if (!target || !store.settings.enabled || !store.settings.controls) return false;
    if (document.fullscreenElement) return false;
    if (dragging || menuOpen || overBar) return true;
    return target.paused || performance.now() - pointer.movedAt < IDLE_MS;
  }

  function render(target: HTMLVideoElement): void {
    const r = target.getBoundingClientRect();
    const left = Math.max(r.left, 0);
    const width = Math.min(r.right, innerWidth) - left;
    const top = Math.min(r.bottom, innerHeight) - BAR_HEIGHT;
    bar.style.transform = `translate(${left}px, ${top}px)`;
    bar.style.width = `${width}px`;
    bar.classList.toggle('narrow', width < 360);
    bar.classList.toggle('tiny', width < 250);

    setIcon(play, target.paused ? ICONS.play : ICONS.pause);
    const muted = isMuted(target);
    setIcon(mute, muted ? ICONS.muted : ICONS.volume);
    if (!slider.matches(':active')) slider.value = String(Math.round((muted ? 0 : target.volume) * 100));
    slider.style.setProperty('--level', `${slider.value}%`);

    const rate = formatSpeed(currentSpeed());
    if (speed.textContent !== rate) speed.textContent = rate;
    speed.classList.toggle('changed', currentSpeed() !== 1);
    for (const item of menu.children as HTMLCollectionOf<HTMLElement>) {
      item.classList.toggle('active', Number(item.dataset.rate) === currentSpeed());
    }

    const duration = target.duration;
    const known = Number.isFinite(duration) && duration > 0;
    time.textContent = `${formatTime(target.currentTime)} / ${known ? formatTime(duration) : '--:--'}`;
    const progress = known ? target.currentTime / duration : 0;
    fill.style.transform = `scaleX(${progress})`;
    thumb.style.left = `${progress * 100}%`;
    let end = 0;
    for (let i = 0; i < target.buffered.length; i++) {
      if (target.buffered.start(i) <= target.currentTime + 0.5) end = Math.max(end, target.buffered.end(i));
    }
    buffered.style.transform = `scaleX(${known ? Math.min(end / duration, 1) : 0})`;
  }

  function frame(): void {
    const hovered = hoveredVideo();
    // Keep the current video while the user works the bar, even if the pointer drifts off it.
    const busy = dragging || menuOpen || overBar;
    if (!busy || !video?.isConnected) video = hovered;
    if (menuOpen && video && !overBar && !contains(video.getBoundingClientRect(), pointer.x, pointer.y)) closeMenu();

    if (shouldShow(video)) {
      if (!mounted) {
        hudRoot().append(bar);
        mounted = true;
      }
      render(video);
      bar.classList.add('show');
      requestAnimationFrame(frame);
      return;
    }
    bar.classList.remove('show');
    closeMenu();
    // Fade-out runs on its own; keep polling while the pointer is still on a video.
    if (hovered && performance.now() - pointer.movedAt < IDLE_MS + 500) {
      requestAnimationFrame(frame);
      return;
    }
    running = false;
  }

  function wake(): void {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }

  window.addEventListener('pointermove', wake, { capture: true, passive: true });
  window.addEventListener('scroll', wake, { capture: true, passive: true });
  document.addEventListener('pause', wake, true);
  relabel();
  subscribe(() => {
    relabel();
    wake();
  });
}
