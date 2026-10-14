import { api } from './browser';
import type { Keymap } from './actions';
import { cleanKeymap } from './keys';

export type AudioMode = 'instagram' | 'unmute' | 'remember';
export type VideoEnd = 'loop' | 'stop' | 'next';
export type Language = 'auto' | 'en' | 'pt';
export type Section = 'feed' | 'reels' | 'stories';

/** Hours when Instagram is limited to Messages. Days are 0 (Sunday) to 6. */
export interface FocusHours {
  on: boolean;
  from: string;
  to: string;
  days: number[];
}

/** Preferences. Synced across the user's browsers. */
export interface Settings {
  enabled: boolean;
  controls: boolean;
  audioMode: AudioMode;
  speedPerSection: boolean;
  autoplay: boolean;
  videoEnd: VideoEnd;
  followingFeed: boolean;
  hideReels: boolean;
  hideExplore: boolean;
  hideSuggestions: boolean;
  messagesOnly: boolean;
  /** Minutes per day; 0 is no limit. */
  dailyLimit: number;
  focusHours: FocusHours;
  language: Language;
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
  autoplay: true,
  videoEnd: 'loop',
  followingFeed: false,
  hideReels: false,
  hideExplore: false,
  hideSuggestions: false,
  messagesOnly: false,
  dailyLimit: 0,
  focusHours: { on: false, from: '09:00', to: '18:00', days: [1, 2, 3, 4, 5] },
  language: 'auto',
  keymap: {},
};

export const DAILY_LIMITS = [0, 15, 30, 45, 60, 90, 120] as const;

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

// Storage can hold anything: an older or newer version's shape, or another
// device's sync. Every read goes through these, so the rest of the code can
// trust the types.
type Stored = Record<string, unknown>;
const asObject = (value: unknown): Stored =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Stored) : {};
const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const speedOr = (value: unknown, fallback: number) => (finite(value) ? clampSpeed(value) : fallback);
const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;
const clock = (value: unknown, fallback: string) =>
  typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;

function cleanFocusHours(raw: unknown): FocusHours {
  const f = asObject(raw);
  const d = DEFAULT_SETTINGS.focusHours;
  const days = Array.isArray(f.days) ? f.days.filter((n): n is number => Number.isInteger(n) && n >= 0 && n <= 6) : d.days;
  return { on: bool(f.on, d.on), from: clock(f.from, d.from), to: clock(f.to, d.to), days: [...new Set(days)].sort() };
}

export function cleanSettings(raw: unknown): Settings {
  const s = asObject(raw);
  const d = DEFAULT_SETTINGS;
  return {
    enabled: bool(s.enabled, d.enabled),
    controls: bool(s.controls, d.controls),
    audioMode: oneOf(s.audioMode, ['instagram', 'unmute', 'remember'], d.audioMode),
    speedPerSection: bool(s.speedPerSection, d.speedPerSection),
    autoplay: bool(s.autoplay, d.autoplay),
    videoEnd: oneOf(s.videoEnd, ['loop', 'stop', 'next'], d.videoEnd),
    followingFeed: bool(s.followingFeed, d.followingFeed),
    hideReels: bool(s.hideReels, d.hideReels),
    hideExplore: bool(s.hideExplore, d.hideExplore),
    hideSuggestions: bool(s.hideSuggestions, d.hideSuggestions),
    messagesOnly: bool(s.messagesOnly, d.messagesOnly),
    dailyLimit: finite(s.dailyLimit) ? Math.min(24 * 60, Math.max(0, Math.round(s.dailyLimit))) : d.dailyLimit,
    focusHours: cleanFocusHours(s.focusHours),
    language: oneOf(s.language, ['auto', 'en', 'pt'], d.language),
    keymap: cleanKeymap(s.keymap),
  };
}

/** True when `now` falls inside the focus hours. A range like 22:00–07:00 runs overnight. */
export function inFocusHours(hours: FocusHours, now = new Date()): boolean {
  if (!hours.on) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const [fh = 0, fm = 0] = hours.from.split(':').map(Number);
  const [th = 0, tm = 0] = hours.to.split(':').map(Number);
  const from = fh * 60 + fm;
  const to = th * 60 + tm;
  if (from === to) return false;
  if (from < to) return hours.days.includes(now.getDay()) && minutes >= from && minutes < to;
  // Overnight: the evening part belongs to today, the morning part to the day it started.
  if (minutes >= from) return hours.days.includes(now.getDay());
  return minutes < to && hours.days.includes((now.getDay() + 6) % 7);
}

/** Time spent on Instagram today, kept per device. */
export interface Usage {
  day: string;
  seconds: number;
  snoozeUntil: number;
}

export function today(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function cleanUsage(raw: unknown): Usage {
  const u = asObject(raw);
  const day = today();
  if (u.day !== day) return { day, seconds: 0, snoozeUntil: 0 };
  return { day, seconds: finite(u.seconds) ? Math.max(0, u.seconds) : 0, snoozeUntil: finite(u.snoozeUntil) ? u.snoozeUntil : 0 };
}

export async function loadUsage(): Promise<Usage> {
  const { usage } = await api.storage.local.get('usage');
  return cleanUsage(usage);
}

export async function addUsage(seconds: number): Promise<Usage> {
  const usage = await loadUsage();
  const next = { ...usage, seconds: usage.seconds + seconds };
  await api.storage.local.set({ usage: next });
  return next;
}

export async function snoozeUsage(ms: number): Promise<void> {
  const usage = await loadUsage();
  await api.storage.local.set({ usage: { ...usage, snoozeUntil: Date.now() + ms } });
}

export function onUsageChange(cb: (usage: Usage) => void): void {
  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.usage) cb(cleanUsage(changes.usage.newValue));
  });
}

/** Profiles opened lately, newest first, for the command palette. */
export async function loadRecentProfiles(): Promise<string[]> {
  const { recent } = await api.storage.local.get('recent');
  return Array.isArray(recent) ? recent.filter((u): u is string => typeof u === 'string' && /^[\w.]{1,30}$/.test(u)).slice(0, 15) : [];
}

export async function rememberProfile(username: string): Promise<void> {
  const recent = await loadRecentProfiles();
  await api.storage.local.set({ recent: [username, ...recent.filter((u) => u !== username)].slice(0, 15) });
}

export function cleanPlayback(raw: unknown): Playback {
  const p = asObject(raw);
  const speeds = asObject(p.speeds);
  const d = DEFAULT_PLAYBACK;
  return {
    speed: speedOr(p.speed, d.speed),
    speeds: {
      feed: speedOr(speeds.feed, d.speeds.feed),
      reels: speedOr(speeds.reels, d.speeds.reels),
      stories: speedOr(speeds.stories, d.speeds.stories),
    },
    volume: finite(p.volume) ? Math.min(1, Math.max(0, p.volume)) : d.volume,
    muted: bool(p.muted, d.muted),
  };
}

export async function loadSettings(): Promise<Settings> {
  const { settings } = await api.storage.sync.get('settings');
  return cleanSettings(settings);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await api.storage.sync.set({ settings: next });
  return next;
}

export async function loadPlayback(): Promise<Playback> {
  const { playback } = await api.storage.local.get('playback');
  return cleanPlayback(playback);
}

export async function savePlayback(playback: Playback): Promise<void> {
  await api.storage.local.set({ playback });
}

export function onSettingsChange(cb: (settings: Settings) => void): void {
  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) cb(cleanSettings(changes.settings.newValue));
  });
}

export function onPlaybackChange(cb: (playback: Playback) => void): void {
  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.playback) cb(cleanPlayback(changes.playback.newValue));
  });
}
