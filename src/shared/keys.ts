import { ACTION_BY_ID, DIGITS, type ActionId, type Keymap } from './actions';

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'OS', 'CapsLock', 'Fn', 'Hyper', 'Super']);

/**
 * Normalizes a key press to a combo such as `K`, `Shift+R`, `>`, `ArrowLeft` or `Ctrl+Shift+K`.
 *
 * Letters are stored uppercase and carry Shift explicitly. Other printable characters
 * already include Shift in `e.key` (`>` is Shift+. on most layouts), so Shift is dropped
 * for them; that keeps bindings working across keyboard layouts.
 */
export function comboFromEvent(e: KeyboardEvent): string | null {
  if (MODIFIERS.has(e.key)) return null;
  let key = e.key;
  const letter = /^Key([A-Z])$/.exec(e.code)?.[1];
  // Option on macOS and non-Latin layouts turn letters into other characters.
  if (letter && (e.altKey || !/^[a-z]$/i.test(key))) key = letter;
  if (key === ' ') key = 'Space';
  if (key === 'Spacebar') key = 'Space';

  let shiftCounts = true;
  if (/^[a-z]$/i.test(key)) key = key.toUpperCase();
  else if (key.length === 1) shiftCounts = false;

  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.metaKey) parts.push('Meta');
  if (shiftCounts && e.shiftKey) parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}

export function isDigitCombo(combo: string): boolean {
  return /^[0-9]$/.test(combo);
}

export function splitCombo(combo: string): string[] {
  if (combo === '+') return ['+'];
  if (combo.endsWith('++')) return [...combo.slice(0, -2).split('+'), '+'];
  return combo.split('+');
}

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const LABELS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
  Meta: IS_MAC ? '⌘' : 'Win',
  Alt: IS_MAC ? '⌥' : 'Alt',
  Ctrl: IS_MAC ? '⌃' : 'Ctrl',
  Shift: IS_MAC ? '⇧' : 'Shift',
};

/** Keycap labels for one combo, e.g. `Shift+R` → `['⇧', 'R']` on macOS. */
export function comboLabels(combo: string): string[] {
  if (combo === DIGITS) return ['0 – 9'];
  return splitCombo(combo).map((part) => LABELS[part] ?? part);
}

export const MAX_KEYS_PER_ACTION = 8;
const MAX_COMBO_LENGTH = 40;

/** A keymap as stored, possibly from another version or device: keeps only known actions and plausible combos. */
export function cleanKeymap(raw: unknown): Keymap {
  const keymap: Keymap = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return keymap;
  for (const [id, keys] of Object.entries(raw)) {
    if (!Object.hasOwn(ACTION_BY_ID, id) || !Array.isArray(keys)) continue;
    const combos = keys.filter((k): k is string => typeof k === 'string' && k.length > 0 && k.length <= MAX_COMBO_LENGTH);
    keymap[id as ActionId] = [...new Set(combos)].slice(0, MAX_KEYS_PER_ACTION);
  }
  return keymap;
}

/** Keys that Instagram or the page also use; video shortcuts only take them in some places. */
export const CONTESTED = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);
