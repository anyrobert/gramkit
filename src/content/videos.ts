// Finds the video a shortcut or the control bar should act on.
//
// Instagram covers its videos with transparent overlays, so hit-testing with
// elementFromPoint finds the overlay, not the video. Everything here works from
// the pointer position and each video's on-screen rectangle instead.

export const pointer = { x: -1, y: -1, movedAt: 0, downAt: 0, downX: -1, downY: -1 };

window.addEventListener(
  'pointermove',
  (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.movedAt = performance.now();
  },
  { capture: true, passive: true },
);

window.addEventListener(
  'pointerdown',
  (e) => {
    pointer.downAt = performance.now();
    pointer.downX = e.clientX;
    pointer.downY = e.clientY;
  },
  { capture: true, passive: true },
);

document.addEventListener('mouseout', (e) => {
  if (!e.relatedTarget) pointer.x = pointer.y = -1;
});

const MIN_SIZE = 80;

function visibleRatio(rect: DOMRect): number {
  const w = Math.min(rect.right, innerWidth) - Math.max(rect.left, 0);
  const h = Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / (rect.width * rect.height);
}

function score(video: HTMLVideoElement): number {
  const rect = video.getBoundingClientRect();
  const ratio = visibleRatio(rect);
  if (ratio <= 0) return 0;
  const offCenter = Math.abs(rect.top + rect.height / 2 - innerHeight / 2) / Math.max(innerHeight, 1);
  return Math.max(ratio - offCenter, 0.001);
}

export function contains(rect: DOMRect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export function isPlaying(video: HTMLVideoElement): boolean {
  return !video.paused && !video.ended && video.readyState > 2;
}

/** Videos the user can see. With a post or story dialog open, only the ones inside it. */
export function candidates(): HTMLVideoElement[] {
  const all = [...document.querySelectorAll('video')].filter((video) => {
    if (!video.isConnected || video.closest('[aria-hidden="true"]')) return false;
    const rect = video.getBoundingClientRect();
    return rect.width >= MIN_SIZE && rect.height >= MIN_SIZE && visibleRatio(rect) > 0;
  });
  const inDialog = all.filter((video) => video.closest('[role="dialog"]'));
  return inDialog.length ? inDialog : all;
}

/** How far up from a video Instagram keeps the overlays and buttons drawn on top of it. */
const OVERLAY_DEPTH = 14;

/**
 * True when something unrelated sits on top at the pointer: a sign-up dialog,
 * its backdrop, a menu. Instagram's own overlays share a close ancestor with
 * the video; modals are portals near the root and don't.
 */
function coveredAtPointer(video: HTMLVideoElement): boolean {
  const top = document.elementFromPoint(pointer.x, pointer.y);
  if (!top || top === video || top.localName === 'gramkit-hud') return false;
  let node: Element | null = video.parentElement;
  for (let depth = 0; node && depth < OVERLAY_DEPTH; depth++, node = node.parentElement) {
    if (node === document.body) break;
    if (node.contains(top)) return false;
  }
  return true;
}

export function hoveredVideo(): HTMLVideoElement | null {
  if (pointer.x < 0) return null;
  const hits = candidates().filter((video) => contains(video.getBoundingClientRect(), pointer.x, pointer.y));
  // Nested hits are rare; the smallest one is the most specific.
  hits.sort((a, b) => area(a) - area(b));
  const hit = hits[0];
  return hit && !coveredAtPointer(hit) ? hit : null;
}

function area(video: HTMLVideoElement): number {
  const rect = video.getBoundingClientRect();
  return rect.width * rect.height;
}

function best(videos: HTMLVideoElement[]): HTMLVideoElement | null {
  let top: HTMLVideoElement | null = null;
  let topScore = 0;
  for (const video of videos) {
    const s = score(video);
    if (s > topScore) {
      top = video;
      topScore = s;
    }
  }
  return top;
}

/** The video a shortcut acts on: the hovered one, else the most prominent playing one, else the most prominent one. */
export function activeVideo(): HTMLVideoElement | null {
  const all = candidates();
  return hoveredVideo() ?? best(all.filter(isPlaying)) ?? best(all);
}

/** The video whose sound the user hears: the most prominent playing one, preferring the hovered one. */
export function audibleVideo(): HTMLVideoElement | null {
  const playing = candidates().filter((video) => !video.paused && !video.ended);
  const hovered = hoveredVideo();
  if (hovered && playing.includes(hovered)) return hovered;
  return best(playing);
}
