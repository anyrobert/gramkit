// Posts: which one is "current", moving between them, Instagram's own buttons
// (like, save, comments, carousel arrows) and downloading what's on screen.
//
// Instagram's buttons are <div role="button"> around an <svg aria-label="Like">.
// The label follows the account's language, so each button is matched against
// its English, Portuguese and Spanish names.

import type { DownloadFile } from '../shared/browser';
import { t } from '../shared/i18n';
import { sendDownloads } from './commands';
import { toast } from './hud';
import { nextReel } from './media';
import { activeVideo, hoveredVideo, pointer, contains } from './videos';

const LABELS = {
  like: ['like', 'unlike', 'curtir', 'descurtir', 'me gusta', 'ya no me gusta'],
  unlike: ['unlike', 'descurtir', 'ya no me gusta'],
  comment: ['comment', 'comentar', 'comentário', 'comentarios'],
  save: ['save', 'remove', 'salvar', 'remover', 'guardar', 'eliminar'],
  saved: ['remove', 'remover', 'eliminar'],
  next: ['next', 'avançar', 'próximo', 'siguiente'],
  prev: ['go back', 'voltar', 'anterior', 'atrás', 'volver'],
  pause: ['pause', 'pausar'],
  play: ['play', 'reproduzir', 'reproducir'],
  search: ['search', 'pesquisar', 'pesquisa', 'buscar', 'búsqueda'],
} as const;

type LabelSet = readonly string[];

const label = (node: Element) => (node.getAttribute('aria-label') ?? '').trim().toLowerCase();

/** Instagram's button (or link) labelled with one of `names`, inside `root`. */
export function findButton(root: ParentNode, names: LabelSet): HTMLElement | null {
  for (const node of root.querySelectorAll('[aria-label]')) {
    if (!names.includes(label(node))) continue;
    const target = node.closest<HTMLElement>('button, [role="button"], a') ?? (node instanceof HTMLElement ? node : null);
    if (target && target.getClientRects().length) return target;
  }
  return null;
}

function allButtons(root: ParentNode, names: LabelSet): HTMLElement[] {
  return [...root.querySelectorAll('[aria-label]')]
    .filter((node) => names.includes(label(node)))
    .map((node) => node.closest<HTMLElement>('button, [role="button"], a') ?? (node as HTMLElement))
    .filter((node) => node.getClientRects().length > 0);
}

/** The like / comment / share / save row: in other languages, find it by shape. */
function actionRow(post: HTMLElement): HTMLElement[] {
  for (const section of post.querySelectorAll('section')) {
    const buttons = [...section.querySelectorAll<HTMLElement>('[role="button"], button')].filter((b) => b.querySelector('svg'));
    if (buttons.length >= 4) return buttons;
  }
  return [];
}

function hasActions(node: Element): boolean {
  return !!findButton(node, LABELS.like) || actionRow(node as HTMLElement).length > 0;
}

/** Walks up from a video to the element that holds its post's buttons. */
function postAround(node: Element | null): HTMLElement | null {
  for (let el = node?.parentElement, depth = 0; el && el !== document.body && depth < 24; el = el.parentElement, depth++) {
    if (hasActions(el)) return el;
  }
  return null;
}

function visibleArea(el: Element): number {
  const r = el.getBoundingClientRect();
  const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
  const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
  return w > 0 && h > 0 ? w * h : 0;
}

function feedPosts(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('main article, article')].filter((a, i, all) => all.indexOf(a) === i && !a.closest('[role="dialog"]'));
}

function openDialog(): HTMLElement | null {
  const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].filter((d) => visibleArea(d) > 0 && hasActions(d));
  return dialogs.at(-1) ?? null;
}

/** The post the user is looking at: an open post dialog, the hovered post, the most visible feed post, or the active video's post. */
export function currentPost(): HTMLElement | null {
  const dialog = openDialog();
  if (dialog) return dialog;
  const posts = feedPosts();
  const under = posts.find((p) => contains(p.getBoundingClientRect(), pointer.x, pointer.y));
  if (under) return under;
  const hovered = hoveredVideo();
  if (hovered) return postAround(hovered);
  const best = posts.map((p) => ({ p, area: visibleArea(p) })).sort((a, b) => b.area - a.area)[0];
  if (best && best.area > 0) return best.p;
  const video = activeVideo();
  if (video) return postAround(video);
  return document.querySelector<HTMLElement>('main') && hasActions(document.querySelector('main')!) ? document.querySelector<HTMLElement>('main') : null;
}

// Moving between posts ----------------------------------------------------------

export function stepPost(direction: 1 | -1): boolean {
  if (openDialog()) return false;
  const posts = feedPosts();
  if (!posts.length) {
    const video = activeVideo();
    if (!video || direction < 0) return false;
    nextReel(video);
    return true;
  }
  const tops = posts.map((p) => ({ p, top: p.getBoundingClientRect().top, area: visibleArea(p) })).sort((a, b) => a.top - b.top);
  // Step from the post being read (the most visible one); going back from the
  // middle of a post goes to its start first.
  const reading = tops.reduce((best, x) => (x.area > best.area ? x : best), tops[0]!);
  const i = tops.indexOf(reading);
  let target;
  if (!reading.area) target = direction > 0 ? tops.find((x) => x.top > 0) : tops.filter((x) => x.top < 0).at(-1);
  else if (direction > 0) target = tops[i + 1];
  else target = reading.top < -8 ? reading : tops[i - 1];
  if (!target) return false;
  target.p.scrollIntoView({ block: 'start', behavior: 'smooth' });
  return true;
}

// Instagram's buttons ---------------------------------------------------------------

function press(target: HTMLElement | null | undefined): boolean {
  if (!target) return false;
  target.click();
  return true;
}

export function toggleLike(): boolean {
  const post = currentPost();
  if (!post) return false;
  const button = findButton(post, LABELS.like) ?? actionRow(post)[0];
  if (!button) return false;
  const wasLiked = !!findButton(post, LABELS.unlike);
  press(button);
  toast(wasLiked ? t('Unliked') : '♥', hoveredVideo() ?? activeVideo());
  return true;
}

export function toggleSave(): boolean {
  const post = currentPost();
  if (!post) return false;
  const button = findButton(post, LABELS.save) ?? actionRow(post).at(-1);
  if (!button) return false;
  const wasSaved = !!findButton(post, LABELS.saved);
  press(button);
  toast(wasSaved ? t('Removed from saved') : t('Saved'), hoveredVideo() ?? activeVideo());
  return true;
}

export function openComments(): boolean {
  const post = currentPost();
  return !!post && press(findButton(post, LABELS.comment) ?? actionRow(post)[1]);
}

const NOT_PROFILES = new Set(['explore', 'reels', 'reel', 'p', 'direct', 'accounts', 'stories', 'about', 'legal', 'tv', 'web']);

export function profilePath(href: string): string | null {
  const url = new URL(href, location.href);
  if (url.hostname !== location.hostname) return null;
  const match = /^\/([\w.]{1,30})\/$/.exec(url.pathname);
  return match && !NOT_PROFILES.has(match[1]!) ? match[1]! : null;
}

export function openProfile(): boolean {
  const post = currentPost();
  if (!post) return false;
  const link = [...post.querySelectorAll<HTMLAnchorElement>('a[href]')].find((a) => profilePath(a.href));
  return press(link);
}

/** The carousel arrow over the post's main photo, not a dialog's next-post arrow. */
export function stepSlide(direction: 1 | -1): boolean {
  const post = currentPost();
  if (!post) return false;
  const buttons = allButtons(post, direction > 0 ? LABELS.next : LABELS.prev);
  if (!buttons.length) return false;
  const media = [...post.querySelectorAll('img, video')].sort((a, b) => visibleArea(b) - visibleArea(a))[0];
  const box = media?.getBoundingClientRect();
  const inside = box && buttons.find((b) => {
    const r = b.getBoundingClientRect();
    return contains(box, r.left + r.width / 2, r.top + r.height / 2);
  });
  return press(inside ?? buttons[0]);
}

/** Stories keep their own timer; use Instagram's pause button so it stays in step. */
export function toggleStoryPause(): boolean {
  return press(findButton(document, LABELS.pause) ?? findButton(document, LABELS.play));
}

export function openSearch(): boolean {
  const button = findButton(document, LABELS.search);
  if (button) return press(button);
  location.assign('/explore/search/');
  return true;
}

// Downloads ----------------------------------------------------------------------------

type Media = {
  pk?: string | number;
  id?: string;
  code?: string;
  media_type?: number;
  user?: { username?: string };
  image_versions2?: { candidates?: { url: string; width?: number }[] };
  video_versions?: { url: string; width?: number }[];
  carousel_media?: Media[];
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Instagram's shortcode is the media id in base 64. Private posts append more characters. */
export function shortcodeToPk(code: string): string {
  let n = 0n;
  for (const c of code.slice(0, 11)) n = n * 64n + BigInt(ALPHABET.indexOf(c));
  return n.toString();
}

const DEFAULT_APP_ID = '936619743392459';

function appId(): string {
  for (const script of document.scripts) {
    const match = /"(?:X-IG-App-ID|APP_ID|appId)":"(\d{6,})"/.exec(script.textContent ?? '');
    if (match) return match[1]!;
  }
  return DEFAULT_APP_ID;
}

// Firefox runs content-script fetch() as the extension; content.fetch() is the page's own.
const pageFetch: typeof fetch = (globalThis as unknown as { content?: { fetch?: typeof fetch } }).content?.fetch ?? fetch.bind(globalThis);

async function api<T>(path: string): Promise<T | null> {
  try {
    const response = await pageFetch(path, {
      credentials: 'include',
      headers: { 'x-ig-app-id': appId(), 'x-requested-with': 'XMLHttpRequest' },
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('json')) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** Posts opened directly carry their media in the page's JSON. */
function embeddedMedia(code: string | undefined, pk: string): Media | null {
  for (const script of document.querySelectorAll('script[type="application/json"]')) {
    const text = script.textContent ?? '';
    if (!(code && text.includes(code)) && !text.includes(pk)) continue;
    let found: Media | null = null;
    const visit = (value: unknown): void => {
      if (found || typeof value !== 'object' || value === null) return;
      const m = value as Media;
      const match = (code && m.code === code) || String(m.pk ?? '') === pk || (typeof m.id === 'string' && m.id.startsWith(`${pk}_`));
      if (match && (m.image_versions2 || m.video_versions || m.carousel_media)) {
        found = m;
        return;
      }
      for (const child of Object.values(value)) visit(child);
    };
    try {
      visit(JSON.parse(text));
    } catch {
      continue;
    }
    if (found) return found;
  }
  return null;
}

const widest = <T extends { width?: number }>(list: T[] | undefined): T | undefined =>
  list?.slice().sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];

function extension(url: string, video: boolean): string {
  return /\.(\w{3,4})$/.exec(new URL(url).pathname)?.[1] ?? (video ? 'mp4' : 'jpg');
}

export function filesFor(media: Media, name: string): DownloadFile[] {
  const parts = media.carousel_media?.length ? media.carousel_media : [media];
  const files: DownloadFile[] = [];
  parts.forEach((part, i) => {
    const video = widest(part.video_versions)?.url;
    const url = video ?? widest(part.image_versions2?.candidates)?.url;
    if (!url) return;
    files.push({ url, filename: `${name}${parts.length > 1 ? `_${i + 1}` : ''}.${extension(url, !!video)}` });
  });
  return files;
}

type Target = { pk: string; code?: string; kind: 'post' | 'story' };

function codeFromPath(pathname: string): string | null {
  return /\/(?:p|reel|reels|tv)\/([\w-]{5,})/.exec(pathname)?.[1] ?? null;
}

function downloadTarget(from?: Element | null): Target | null {
  const story = /^\/stories\/(?!highlights\/)[\w.]+\/(\d+)/.exec(location.pathname);
  if (story) return { pk: story[1]!, kind: 'story' };
  const fromUrl = codeFromPath(location.pathname);
  // A post page or an open post dialog: the URL names it.
  if (fromUrl && (openDialog() || !feedPosts().length)) return { pk: shortcodeToPk(fromUrl), code: fromUrl, kind: 'post' };
  const post = (from && postAround(from)) || currentPost();
  if (post) {
    for (const link of post.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      const code = codeFromPath(new URL(link.href, location.href).pathname);
      if (code) return { pk: shortcodeToPk(code), code, kind: 'post' };
    }
  }
  return fromUrl ? { pk: shortcodeToPk(fromUrl), code: fromUrl, kind: 'post' } : null;
}

/** Downloads the post, reel or story on screen, or the post around `from` (a video). */
export async function downloadCurrent(from?: HTMLVideoElement | null): Promise<boolean> {
  const target = downloadTarget(from);
  const anchor = from ?? hoveredVideo() ?? activeVideo();
  if (!target) {
    toast(t(location.pathname.startsWith('/stories/') ? 'Open a single story to download it' : 'No post to download here'), anchor);
    return true;
  }
  toast(t('Preparing download…'), anchor);
  const info = await api<{ items?: Media[] }>(`/api/v1/media/${target.pk}/info/`);
  const media = info?.items?.[0] ?? embeddedMedia(target.code, target.pk);
  if (!media) {
    toast(t('Couldn’t get this post. Are you logged in?'), anchor);
    return true;
  }
  const user = media.user?.username ?? 'instagram';
  const name = target.kind === 'story' ? `${user}_story_${target.pk}` : `${user}_${media.code ?? target.code ?? target.pk}`;
  const files = filesFor(media, name);
  if (!files.length) {
    toast(t('Nothing to download in this post'), anchor);
    return true;
  }
  const result = await sendDownloads(files);
  toast(
    result.failed ? t('Download failed') : files.length > 1 ? t('Downloading {n} files', { n: files.length }) : t('Downloading'),
    anchor,
  );
  return true;
}
