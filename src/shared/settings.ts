import { api } from './browser';
import type { Keymap } from './actions';

export type AudioMode = 'instagram' | 'unmute' | 'remember';
export type Section = 'feed' | 'reels' | 'stories';

/** Preferences. Synced across the user's browsers. */
export interface Settings {
  enabled: boolean;
  controls: boolean;
  audioMode: AudioMode;
  speedPerSection: boolean;
  followingFeed: boolean;
  hideReels: boolean;
  hideExplore: boolean;
  hideSuggestions: boolean;
  keymap: Keymap;
}

/** Live playback state. Changes often (every volume drag), so it stays in local storage. */
export interface Playback {
  speed: number;
  speeds: Record<Section, number>;
  volume: number;
  muted: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  controls: true,
  audioMode: 'remember',
  speedPerSection: false,
  followingFeed: false,
  hideReels: false,
  hideExplore: false,
  hideSuggestions: false,
  keymap: {},
};

export const DEFAULT_PLAYBACK: Playback = {
  speed: 1,
  speeds: { feed: 1, reels: 1, stories: 1 },
  volume: 0.7,
  muted: true,
};

export const SPEED_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4] as const;
// Firefox mutes audio outside 0.25×–4×.
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;

export function clampSpeed(rate: number): number {
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(rate * 100) / 100));
}

export function stepSpeed(rate: number, direction: 1 | -1): number {
  if (direction > 0) return SPEED_STEPS.find((s) => s > rate + 0.001) ?? MAX_SPEED;
  return [...SPEED_STEPS].reverse().find((s) => s < rate - 0.001) ?? MIN_SPEED;
}

export function formatSpeed(rate: number): string {
  return `${Number(rate.toFixed(2))}×`;
}

export function sectionOf(pathname: string): Section {
  if (/^\/reels?\//.test(pathname)) return 'reels';
  if (pathname.startsWith('/stories/')) return 'stories';
  return 'feed';
}

export function speedFor(settings: Settings, playback: Playback, section: Section): number {
  return settings.speedPerSection ? playback.speeds[section] : playback.speed;
}

export function withSpeed(settings: Settings, playback: Playback, section: Section, rate: number): Partial<Playback> {
  rate = clampSpeed(rate);
  return settings.speedPerSection ? { speeds: { ...playback.speeds, [section]: rate } } : { speed: rate };
}

export async function loadSettings(): Promise<Settings> {
  const { settings } = await api.storage.sync.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await api.storage.sync.set({ settings: next });
  return next;
}

export async function loadPlayback(): Promise<Playback> {
  const { playback } = await api.storage.local.get('playback');
  const stored = playback as Partial<Playback> | undefined;
  return { ...DEFAULT_PLAYBACK, ...stored, speeds: { ...DEFAULT_PLAYBACK.speeds, ...stored?.speeds } };
}

export async function savePlayback(playback: Playback): Promise<void> {
  await api.storage.local.set({ playback });
}

export function onSettingsChange(cb: (settings: Settings) => void): void {
  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) cb({ ...DEFAULT_SETTINGS, ...(changes.settings.newValue as Partial<Settings>) });
  });
}

export function onPlaybackChange(cb: (playback: Playback) => void): void {
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.playback) return;
    const stored = changes.playback.newValue as Partial<Playback>;
    cb({ ...DEFAULT_PLAYBACK, ...stored, speeds: { ...DEFAULT_PLAYBACK.speeds, ...stored?.speeds } });
  });
}
