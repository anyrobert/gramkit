import {
  DEFAULT_PLAYBACK,
  DEFAULT_SETTINGS,
  loadPlayback,
  loadSettings,
  onPlaybackChange,
  onSettingsChange,
  savePlayback,
  type Playback,
  type Settings,
} from '../shared/settings';

type Listener = (prev: { settings: Settings; playback: Playback }) => void;

export const store = {
  settings: DEFAULT_SETTINGS,
  playback: DEFAULT_PLAYBACK,
};

const listeners = new Set<Listener>();
let writeTimer: ReturnType<typeof setTimeout> | undefined;
/** Our writes whose storage.onChanged echo hasn't arrived yet. */
const inFlight: string[] = [];

export function subscribe(listener: Listener): void {
  listeners.add(listener);
}

function emit(prev: typeof store): void {
  for (const listener of listeners) listener(prev);
}

function write(): void {
  writeTimer = undefined;
  inFlight.push(JSON.stringify(store.playback));
  if (inFlight.length > 50) inFlight.shift();
  void savePlayback(store.playback);
}

export function setPlayback(patch: Partial<Playback>): void {
  const prev = { ...store };
  store.playback = { ...store.playback, ...patch };
  emit(prev);
  clearTimeout(writeTimer);
  // Volume drags fire dozens of changes a second; batch those. Everything else
  // is a single key press and is saved at once, so a reload right after keeps it.
  const onlyVolume = Object.keys(patch).every((key) => key === 'volume');
  if (onlyVolume) writeTimer = setTimeout(write, 200);
  else write();
}

export async function initStore(): Promise<void> {
  const [settings, playback] = await Promise.all([loadSettings(), loadPlayback()]);
  const prev = { ...store };
  store.settings = settings;
  store.playback = playback;
  emit(prev);

  onSettingsChange((next) => {
    const prev = { ...store };
    store.settings = next;
    emit(prev);
  });
  onPlaybackChange((next) => {
    // Echoes of our own writes arrive late, possibly after newer ones; applying
    // them would roll the state back. Anything else is the popup or another tab.
    const echo = inFlight.indexOf(JSON.stringify(next));
    if (echo !== -1) {
      inFlight.splice(0, echo + 1);
      return;
    }
    const prev = { ...store };
    store.playback = next;
    emit(prev);
  });
}
