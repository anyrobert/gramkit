export type ActionId =
  | 'video.playPause'
  | 'video.back5'
  | 'video.forward5'
  | 'video.back10'
  | 'video.forward10'
  | 'video.jump'
  | 'speed.up'
  | 'speed.down'
  | 'speed.reset'
  | 'sound.mute'
  | 'sound.up'
  | 'sound.down'
  | 'view.fullscreen'
  | 'view.pip'
  | 'app.help';

export type ActionGroup = 'Playback' | 'Speed' | 'Sound' | 'View' | 'General';

export interface ActionDef {
  id: ActionId;
  group: ActionGroup;
  label: string;
  keys: string[];
  /** Keep firing while the key is held down. */
  repeat?: boolean;
}

/** Binding token for `video.jump`: any digit key jumps to that tenth of the video. */
export const DIGITS = '0-9';

export const ACTIONS: readonly ActionDef[] = [
  { id: 'video.playPause', group: 'Playback', label: 'Play / pause', keys: ['K', 'Space'] },
  { id: 'video.back5', group: 'Playback', label: 'Back 5 seconds', keys: ['ArrowLeft'], repeat: true },
  { id: 'video.forward5', group: 'Playback', label: 'Forward 5 seconds', keys: ['ArrowRight'], repeat: true },
  { id: 'video.back10', group: 'Playback', label: 'Back 10 seconds', keys: ['J'], repeat: true },
  { id: 'video.forward10', group: 'Playback', label: 'Forward 10 seconds', keys: ['L'], repeat: true },
  { id: 'video.jump', group: 'Playback', label: 'Jump to 0–90%', keys: [DIGITS] },
  { id: 'speed.up', group: 'Speed', label: 'Faster', keys: ['>'], repeat: true },
  { id: 'speed.down', group: 'Speed', label: 'Slower', keys: ['<'], repeat: true },
  { id: 'speed.reset', group: 'Speed', label: 'Normal speed (1×)', keys: ['Shift+R'] },
  { id: 'sound.mute', group: 'Sound', label: 'Mute / unmute', keys: ['M'] },
  { id: 'sound.up', group: 'Sound', label: 'Volume up', keys: ['ArrowUp'], repeat: true },
  { id: 'sound.down', group: 'Sound', label: 'Volume down', keys: ['ArrowDown'], repeat: true },
  { id: 'view.fullscreen', group: 'View', label: 'Fullscreen', keys: ['F'] },
  { id: 'view.pip', group: 'View', label: 'Picture-in-picture', keys: ['P'] },
  { id: 'app.help', group: 'General', label: 'Show shortcuts', keys: ['?'] },
];

export const ACTION_BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a])) as Record<ActionId, ActionDef>;

export const GROUPS: readonly ActionGroup[] = ['Playback', 'Speed', 'Sound', 'View', 'General'];

export type Keymap = Partial<Record<ActionId, string[]>>;

export function keysFor(id: ActionId, keymap: Keymap): string[] {
  return keymap[id] ?? ACTION_BY_ID[id].keys;
}

/** combo → action, with user overrides applied. */
export function resolveKeymap(keymap: Keymap): Map<string, ActionId> {
  const map = new Map<string, ActionId>();
  for (const action of ACTIONS) {
    for (const combo of keysFor(action.id, keymap)) map.set(combo, action.id);
  }
  return map;
}
