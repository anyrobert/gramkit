export type ActionId =
  | 'video.playPause'
  | 'video.back5'
  | 'video.forward5'
  | 'video.back10'
  | 'video.forward10'
  | 'video.jump'
  | 'video.frameBack'
  | 'video.frameForward'
  | 'speed.up'
  | 'speed.down'
  | 'speed.reset'
  | 'sound.mute'
  | 'sound.up'
  | 'sound.down'
  | 'view.fullscreen'
  | 'view.pip'
  | 'view.saveFrame'
  | 'post.next'
  | 'post.prev'
  | 'post.like'
  | 'post.save'
  | 'post.comments'
  | 'post.profile'
  | 'post.slideNext'
  | 'post.slidePrev'
  | 'post.download'
  | 'go.home'
  | 'go.messages'
  | 'go.explore'
  | 'go.reels'
  | 'go.profile'
  | 'go.saved'
  | 'go.search'
  | 'app.palette'
  | 'app.help';

export type ActionGroup = 'Playback' | 'Speed' | 'Sound' | 'View' | 'Posts' | 'Go to' | 'General';

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

// Combos with a space are sequences: `G H` is G, then H.
export const ACTIONS: readonly ActionDef[] = [
  { id: 'video.playPause', group: 'Playback', label: 'Play / pause', keys: ['K', 'Space'] },
  { id: 'video.back5', group: 'Playback', label: 'Back 5 seconds', keys: ['ArrowLeft'], repeat: true },
  { id: 'video.forward5', group: 'Playback', label: 'Forward 5 seconds', keys: ['ArrowRight'], repeat: true },
  { id: 'video.back10', group: 'Playback', label: 'Back 10 seconds', keys: ['J'], repeat: true },
  { id: 'video.forward10', group: 'Playback', label: 'Forward 10 seconds', keys: ['L'], repeat: true },
  { id: 'video.jump', group: 'Playback', label: 'Jump to 0–90%', keys: [DIGITS] },
  { id: 'video.frameBack', group: 'Playback', label: 'Previous frame', keys: [','], repeat: true },
  { id: 'video.frameForward', group: 'Playback', label: 'Next frame', keys: ['.'], repeat: true },
  { id: 'speed.up', group: 'Speed', label: 'Faster', keys: ['>'], repeat: true },
  { id: 'speed.down', group: 'Speed', label: 'Slower', keys: ['<'], repeat: true },
  { id: 'speed.reset', group: 'Speed', label: 'Normal speed (1×)', keys: ['Shift+R'] },
  { id: 'sound.mute', group: 'Sound', label: 'Mute / unmute', keys: ['M'] },
  { id: 'sound.up', group: 'Sound', label: 'Volume up', keys: ['ArrowUp'], repeat: true },
  { id: 'sound.down', group: 'Sound', label: 'Volume down', keys: ['ArrowDown'], repeat: true },
  { id: 'view.fullscreen', group: 'View', label: 'Fullscreen', keys: ['F'] },
  { id: 'view.pip', group: 'View', label: 'Picture-in-picture', keys: ['P'] },
  { id: 'view.saveFrame', group: 'View', label: 'Save frame as image', keys: ['Shift+S'] },
  { id: 'post.next', group: 'Posts', label: 'Next post', keys: ['Shift+J'] },
  { id: 'post.prev', group: 'Posts', label: 'Previous post', keys: ['Shift+K'] },
  { id: 'post.like', group: 'Posts', label: 'Like', keys: ['Shift+L'] },
  { id: 'post.save', group: 'Posts', label: 'Save to collection', keys: ['Shift+B'] },
  { id: 'post.comments', group: 'Posts', label: 'Open comments', keys: ['Shift+C'] },
  { id: 'post.profile', group: 'Posts', label: 'Open profile', keys: ['Shift+U'] },
  { id: 'post.slideNext', group: 'Posts', label: 'Next photo in carousel', keys: [']'] },
  { id: 'post.slidePrev', group: 'Posts', label: 'Previous photo in carousel', keys: ['['] },
  { id: 'post.download', group: 'Posts', label: 'Download post or story', keys: ['Shift+D'] },
  { id: 'go.home', group: 'Go to', label: 'Home', keys: ['G H'] },
  { id: 'go.messages', group: 'Go to', label: 'Messages', keys: ['G M'] },
  { id: 'go.explore', group: 'Go to', label: 'Explore', keys: ['G E'] },
  { id: 'go.reels', group: 'Go to', label: 'Reels', keys: ['G R'] },
  { id: 'go.profile', group: 'Go to', label: 'Your profile', keys: ['G P'] },
  { id: 'go.saved', group: 'Go to', label: 'Saved', keys: ['G S'] },
  { id: 'go.search', group: 'Go to', label: 'Search', keys: ['/'] },
  { id: 'app.palette', group: 'General', label: 'Command palette', keys: ['Ctrl+K', 'Meta+K'] },
  { id: 'app.help', group: 'General', label: 'Show shortcuts', keys: ['?'] },
];

export const ACTION_BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a])) as Record<ActionId, ActionDef>;

export const GROUPS: readonly ActionGroup[] = ['Playback', 'Speed', 'Sound', 'View', 'Posts', 'Go to', 'General'];

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

/** First keys of every sequence binding (`G` for `G H`). */
export function sequenceStarts(keymap: Map<string, ActionId>): Set<string> {
  return new Set([...keymap.keys()].filter((combo) => combo.includes(' ')).map((combo) => combo.split(' ')[0]!));
}
