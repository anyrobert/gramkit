import { ACTIONS, ACTION_BY_ID, DIGITS, GROUPS, keysFor, type ActionId, type Keymap } from '../shared/actions';
import { comboFromEvent, comboLabels } from '../shared/keys';
import { loadSettings, onSettingsChange, saveSettings, type Settings } from '../shared/settings';
import { $, bindSettings, buildRows, renderSettings } from '../shared/ui';

const keymapRoot = $('#keymap');

let settings: Settings;
let capturing: ActionId | null = null;
const notes = new Map<ActionId, string>();

function sameKeys(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

async function saveKeymap(keymap: Keymap): Promise<void> {
  for (const action of ACTIONS) {
    const keys = keymap[action.id];
    if (keys && sameKeys(keys, action.keys)) delete keymap[action.id];
  }
  settings = await saveSettings({ keymap });
  render();
}

function caps(combo: string): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'caps';
  for (const label of comboLabels(combo)) {
    const kbd = document.createElement('kbd');
    kbd.textContent = label;
    wrap.append(kbd);
  }
  return wrap;
}

function button(className: string, text: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = text;
  b.setAttribute('aria-label', label);
  b.title = label;
  b.addEventListener('click', onClick);
  return b;
}

function row(id: ActionId): HTMLElement {
  const action = ACTION_BY_ID[id];
  const keys = keysFor(id, settings.keymap);
  const node = document.createElement('div');
  node.className = 'km-row';

  const label = document.createElement('div');
  label.className = 'km-label';
  label.textContent = action.label;
  const note = notes.get(id);
  if (note) {
    const n = document.createElement('span');
    n.className = 'km-note';
    n.textContent = note;
    label.append(n);
  }

  const right = document.createElement('div');
  right.className = 'km-keys';

  if (capturing === id) {
    const capture = document.createElement('span');
    capture.className = 'capture';
    capture.append('Press a key…');
    const esc = document.createElement('kbd');
    esc.textContent = 'Esc';
    capture.append(esc, 'cancels');
    right.append(capture);
  } else {
    if (!keys.length) {
      const none = document.createElement('span');
      none.className = 'unbound';
      none.textContent = 'Not set';
      right.append(none);
    }
    for (const combo of keys) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.append(caps(combo));
      chip.append(
        button('chip-remove', '×', `Remove ${comboLabels(combo).join(' ')}`, () => {
          void saveKeymap({ ...settings.keymap, [id]: keys.filter((k) => k !== combo) });
        }),
      );
      right.append(chip);
    }
    if (id === 'video.jump') {
      if (!keys.includes(DIGITS)) right.append(button('add', '+', 'Use the number keys', () => void saveKeymap({ ...settings.keymap, [id]: [DIGITS] })));
    } else {
      right.append(
        button('add', '+', `Add a shortcut for ${action.label}`, () => {
          capturing = id;
          render();
        }),
      );
    }
    if (settings.keymap[id]) right.append(button('reset', 'Reset', `Reset ${action.label}`, () => {
      const keymap = { ...settings.keymap };
      delete keymap[id];
      void saveKeymap(keymap);
    }));
  }

  node.append(label, right);
  return node;
}

function render(): void {
  renderSettings(document, settings);
  keymapRoot.replaceChildren(
    ...GROUPS.map((group) => {
      const section = document.createElement('section');
      section.className = 'km-group';
      const h = document.createElement('h3');
      h.textContent = group;
      section.append(h, ...ACTIONS.filter((a) => a.group === group).map((a) => row(a.id)));
      return section;
    }),
  );
}

function flashNote(id: ActionId, text: string): void {
  notes.set(id, text);
  setTimeout(() => {
    if (notes.get(id) !== text) return;
    notes.delete(id);
    render();
  }, 3500);
}

window.addEventListener(
  'keydown',
  (e) => {
    if (!capturing) return;
    const combo = comboFromEvent(e);
    if (!combo) return;
    e.preventDefault();
    e.stopPropagation();
    const id = capturing;
    capturing = null;
    if (combo === 'Escape') return render();

    const keymap: Keymap = { ...settings.keymap };
    // A key does one thing: take it away from whichever action had it.
    for (const other of ACTIONS) {
      if (other.id === id) continue;
      const otherKeys = keysFor(other.id, keymap);
      if (otherKeys.includes(combo)) {
        keymap[other.id] = otherKeys.filter((k) => k !== combo);
        flashNote(id, `Moved from “${other.label}”`);
      }
    }
    const keys = keysFor(id, keymap);
    if (!keys.includes(combo)) keymap[id] = [...keys, combo];
    void saveKeymap(keymap);
  },
  true,
);

$('#reset-all').addEventListener('click', () => {
  capturing = null;
  void saveKeymap({});
});

async function main(): Promise<void> {
  buildRows();
  settings = await loadSettings();
  render();
  bindSettings(document, (next) => {
    settings = next;
    render();
  });
  onSettingsChange((next) => {
    settings = next;
    if (!capturing) render();
  });
}

void main();
