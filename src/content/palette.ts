// Command palette (Ctrl/⌘+K): every action, page, setting and recent profile,
// searchable by name.

import { ACTIONS, keysFor, type ActionId } from '../shared/actions';
import { api, type Message } from '../shared/browser';
import { t } from '../shared/i18n';
import { comboLabels, THEN } from '../shared/keys';
import { loadRecentProfiles, saveSettings, SPEED_STEPS, formatSpeed, type Settings } from '../shared/settings';
import { changeSpeed } from './commands';
import { el, hudRoot, toast } from './hud';
import { openPath } from './nav';
import { store } from './store';
import { activeVideo } from './videos';

type Item = { title: string; group: string; keys?: string[]; state?: string; run: () => void };

type BoolSetting = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

const TOGGLES: [BoolSetting, string][] = [
  ['enabled', 'Gramkit'],
  ['controls', 'Control bar'],
  ['speedPerSection', 'Speed per section'],
  ['autoplay', 'Autoplay feed videos'],
  ['followingFeed', 'Open the Following feed'],
  ['hideReels', 'Hide Reels'],
  ['hideExplore', 'Hide Explore'],
  ['hideSuggestions', 'Hide suggested accounts'],
  ['messagesOnly', 'Messages only'],
];

let node: HTMLDivElement | null = null;
let returnFocus: Element | null = null;

export function isPaletteOpen(): boolean {
  return !!node;
}

export function closePalette(): void {
  node?.remove();
  node = null;
  if (returnFocus instanceof HTMLElement) returnFocus.focus({ preventScroll: true });
  returnFocus = null;
}

function items(run: (id: ActionId) => boolean, recent: string[]): Item[] {
  const list: Item[] = [];
  for (const action of ACTIONS) {
    if (action.id === 'app.palette') continue;
    list.push({ title: t(action.label), group: t(action.group), keys: keysFor(action.id, store.settings.keymap), run: () => void run(action.id) });
  }
  list.push({ title: t('Following feed'), group: t('Go to'), run: () => openPath('/?variant=following') });
  for (const rate of SPEED_STEPS.filter((s) => s >= 0.5 && s <= 3)) {
    list.push({ title: t('Speed {rate}', { rate: formatSpeed(rate) }), group: t('Speed'), run: () => changeSpeed(activeVideo(), rate) });
  }
  for (const [key, label] of TOGGLES) {
    const on = store.settings[key];
    list.push({
      title: t(label),
      group: t('Setting'),
      state: on ? t('On') : t('Off'),
      run: () => {
        void saveSettings({ [key]: !on });
        toast(`${t(label)}: ${on ? t('Off') : t('On')}`);
      },
    });
  }
  list.push({
    title: t('Gramkit settings'),
    group: t('Setting'),
    run: () => void api.runtime.sendMessage({ type: 'open-options' } satisfies Message),
  });
  for (const name of recent) list.push({ title: `@${name}`, group: t('Recent'), run: () => openPath(`/${name}/`) });
  return list;
}

function matches(item: Item, words: string[]): boolean {
  const haystack = `${item.title} ${item.group}`.toLowerCase();
  return words.every((w) => haystack.includes(w));
}

function rank(item: Item, query: string): number {
  const title = item.title.toLowerCase();
  if (title.startsWith(query)) return 0;
  if (title.includes(query)) return 1;
  return 2;
}

export function togglePalette(run: (id: ActionId) => boolean): void {
  if (node) return closePalette();
  void loadRecentProfiles().then((recent) => open(run, recent));
}

function open(run: (id: ActionId) => boolean, recent: string[]): void {
  if (node) return;
  returnFocus = document.activeElement;
  const all = items(run, recent);
  const overlay = el('div', 'palette');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', t('Command palette'));
  const card = el('div', 'palette-card');
  const input = el('input', 'palette-input');
  input.type = 'text';
  input.placeholder = t('Type a command, setting or @profile');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'true');
  const list = el('ul', 'palette-list');
  list.setAttribute('role', 'listbox');
  const foot = el('div', 'palette-foot');
  foot.append(el('span', '', `↑ ↓ ${t('to move')}`), el('span', '', `↵ ${t('to run')}`), el('span', '', `Esc ${t('to close')}`));
  card.append(input, list, foot);
  overlay.append(card);

  let shown: Item[] = [];
  let active = 0;

  const execute = (item: Item | undefined) => {
    if (!item) return;
    closePalette();
    item.run();
  };

  const render = () => {
    const query = input.value.trim().toLowerCase();
    const words = query.split(/\s+/).filter(Boolean);
    shown = all.filter((item) => matches(item, words)).sort((a, b) => rank(a, query) - rank(b, query));
    if (query && !query.startsWith('@')) {
      const text = input.value.trim();
      shown.push({
        title: t('Search Instagram for “{q}”', { q: text }),
        group: t('Search'),
        run: () => location.assign(`/explore/search/keyword/?q=${encodeURIComponent(text)}`),
      });
    }
    const handle = /^@([\w.]{1,30})$/.exec(input.value.trim());
    if (handle) shown.unshift({ title: `@${handle[1]}`, group: t('Open profile'), run: () => openPath(`/${handle[1]}/`) });
    active = Math.min(active, Math.max(shown.length - 1, 0));
    list.replaceChildren(
      ...shown.map((item, i) => {
        const li = el('li', `palette-item${i === active ? ' active' : ''}`);
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(i === active));
        li.append(el('span', 'palette-title', item.title));
        if (item.state) li.append(el('span', 'palette-state', item.state));
        if (item.keys?.length) {
          const caps = el('span', 'caps');
          for (const label of comboLabels(item.keys[0]!)) caps.append(label === THEN ? el('span', 'then', t('then')) : el('kbd', '', label));
          li.append(caps);
        }
        li.append(el('span', 'palette-group', item.group));
        li.addEventListener('pointermove', () => {
          if (active === i) return;
          active = i;
          render();
        });
        li.addEventListener('click', () => execute(item));
        return li;
      }),
    );
    if (!shown.length) list.append(el('li', 'palette-empty', t('Nothing matches')));
    list.children[active]?.scrollIntoView({ block: 'nearest' });
  };

  input.addEventListener('input', () => {
    active = 0;
    render();
  });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = shown.length || 1;
      active = (active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      execute(shown[active]);
    }
  });
  for (const type of ['keyup', 'keypress']) input.addEventListener(type, (e) => e.stopPropagation());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePalette();
  });

  hudRoot().append(overlay);
  node = overlay;
  render();
  input.focus({ preventScroll: true });
}
