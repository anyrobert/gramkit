// Binds popup / options controls to settings:
//   <input type="checkbox" data-setting="hideReels">
//   <input type="radio" name="audioMode" value="remember">
//   <select data-select-setting="dailyLimit">
//   <input data-focus="from">   (focus hours: on, from, to, day)

import { t } from './i18n';
import { DAILY_LIMITS, saveSettings, type FocusHours, type Settings } from './settings';

export const $ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) =>
  root.querySelector<T & Element>(selector) as T;

type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];
type Toggle = { key: BoolKey; title: string; sub: string };
type SegKey = 'audioMode' | 'videoEnd';

const VIDEO_TOGGLES: Toggle[] = [
  { key: 'controls', title: 'Control bar', sub: 'Seek, speed and volume on hover' },
  { key: 'speedPerSection', title: 'Speed per section', sub: 'Own speed for feed, Reels, Stories' },
  { key: 'autoplay', title: 'Autoplay in the feed', sub: 'Off: feed videos wait for you' },
];

const FOCUS_TOGGLES: Toggle[] = [
  { key: 'followingFeed', title: 'Open the Following feed', sub: 'People you follow, newest first' },
  { key: 'hideReels', title: 'Hide Reels', sub: 'No Reels tab or Reels feed' },
  { key: 'hideExplore', title: 'Hide Explore', sub: 'No Explore tab or grid' },
  { key: 'hideSuggestions', title: 'Hide suggested accounts', sub: '“Suggested for you” lists' },
  { key: 'messagesOnly', title: 'Messages only', sub: 'Home, Reels and Explore go to Messages' },
];

const SEGS: Record<SegKey, { title: string; sub: string; options: { value: string; label: string }[] }> = {
  audioMode: {
    title: 'Sound',
    sub: 'Start muted, as you left it, or with sound',
    options: [
      { value: 'instagram', label: 'Instagram' },
      { value: 'remember', label: 'Remember' },
      { value: 'unmute', label: 'Always on' },
    ],
  },
  videoEnd: {
    title: 'When a video ends',
    sub: 'Next moves on to the next reel',
    options: [
      { value: 'loop', label: 'Loop' },
      { value: 'stop', label: 'Stop' },
      { value: 'next', label: 'Next' },
    ],
  },
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function textBlock(title: string, sub: string): HTMLSpanElement {
  const text = document.createElement('span');
  text.className = 'row-text';
  const a = document.createElement('span');
  a.className = 'row-title';
  a.textContent = t(title);
  const b = document.createElement('span');
  b.className = 'row-sub';
  b.textContent = t(sub);
  text.append(a, b);
  return text;
}

function toggleRow({ key, title, sub }: Toggle): HTMLLabelElement {
  const row = document.createElement('label');
  row.className = 'row';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'switch';
  input.dataset.setting = key;
  row.append(textBlock(title, sub), input);
  return row;
}

function segRow(key: SegKey): HTMLDivElement {
  const { title, sub, options } = SEGS[key];
  const row = document.createElement('div');
  row.className = 'row stack';
  const seg = document.createElement('div');
  seg.className = 'seg';
  seg.setAttribute('role', 'radiogroup');
  seg.setAttribute('aria-label', t(title));
  for (const { value, label } of options) {
    const option = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = key;
    input.value = value;
    input.dataset.radioSetting = key;
    const span = document.createElement('span');
    span.textContent = t(label);
    option.append(input, span);
    seg.append(option);
  }
  row.append(textBlock(title, sub), seg);
  return row;
}

function selectRow(key: 'dailyLimit' | 'language', title: string, sub: string, options: { value: string; label: string }[]): HTMLLabelElement {
  const row = document.createElement('label');
  row.className = 'row';
  const select = document.createElement('select');
  select.className = 'select';
  select.dataset.selectSetting = key;
  for (const { value, label } of options) select.append(new Option(label, value));
  row.append(textBlock(title, sub), select);
  return row;
}

function limitRow(): HTMLLabelElement {
  return selectRow(
    'dailyLimit',
    'Daily time limit',
    'Then only Messages stay open',
    DAILY_LIMITS.map((m) => ({ value: String(m), label: m ? t('{m} min', { m }) : t('No limit') })),
  );
}

function focusHoursRow(): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'row stack hours';
  const head = document.createElement('label');
  head.className = 'row-head';
  const on = document.createElement('input');
  on.type = 'checkbox';
  on.className = 'switch';
  on.dataset.focus = 'on';
  head.append(textBlock('Focus hours', 'Messages only during these hours'), on);

  const times = document.createElement('div');
  times.className = 'hours-times';
  const time = (part: 'from' | 'to', label: string) => {
    const input = document.createElement('input');
    input.type = 'time';
    input.className = 'time';
    input.dataset.focus = part;
    input.setAttribute('aria-label', t(label));
    return input;
  };
  const dash = document.createElement('span');
  dash.textContent = '–';
  times.append(time('from', 'Start'), dash, time('to', 'End'));

  const days = document.createElement('div');
  days.className = 'days';
  for (const day of WEEK_ORDER) {
    const chip = document.createElement('label');
    chip.className = 'day';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.focus = 'day';
    input.value = String(day);
    const span = document.createElement('span');
    span.textContent = t(DAYS[day]!);
    chip.append(input, span);
    days.append(chip);
  }
  row.append(head, times, days);
  return row;
}

function languageRow(): HTMLLabelElement {
  return selectRow('language', 'Language', 'Gramkit’s own text', [
    { value: 'auto', label: t('Browser default') },
    { value: 'en', label: 'English' },
    { value: 'pt', label: 'Português (Brasil)' },
  ]);
}

/**
 * Fills (or refills, after a language change) `[data-rows]` containers: `video` and `focus` in both pages; `limits`
 * and `general` only where the page has room for them.
 */
export function buildRows(root: ParentNode = document): void {
  for (const container of root.querySelectorAll('[data-rows]')) container.replaceChildren();
  root.querySelector('[data-rows="video"]')?.append(...VIDEO_TOGGLES.map(toggleRow), segRow('audioMode'), segRow('videoEnd'));
  root.querySelector('[data-rows="focus"]')?.append(...FOCUS_TOGGLES.map(toggleRow));
  root.querySelector('[data-rows="limits"]')?.append(limitRow(), focusHoursRow());
  root.querySelector('[data-rows="general"]')?.append(languageRow());
}

export function renderSettings(root: ParentNode, settings: Settings): void {
  for (const input of root.querySelectorAll<HTMLInputElement>('input[data-setting]')) {
    input.checked = Boolean(settings[input.dataset.setting as keyof Settings]);
  }
  for (const radio of root.querySelectorAll<HTMLInputElement>('input[type=radio][data-radio-setting]')) {
    radio.checked = settings[radio.dataset.radioSetting as keyof Settings] === radio.value;
  }
  for (const select of root.querySelectorAll<HTMLSelectElement>('select[data-select-setting]')) {
    select.value = String(settings[select.dataset.selectSetting as keyof Settings]);
  }
  const hours = settings.focusHours;
  for (const input of root.querySelectorAll<HTMLInputElement>('input[data-focus]')) {
    const part = input.dataset.focus;
    if (part === 'on') input.checked = hours.on;
    else if (part === 'day') input.checked = hours.days.includes(Number(input.value));
    else if ((part === 'from' || part === 'to') && document.activeElement !== input) input.value = hours[part];
  }
  for (const node of root.querySelectorAll<HTMLElement>('.hours')) node.dataset.on = String(hours.on);
  for (const node of root.querySelectorAll<HTMLElement>('[data-when]')) {
    node.dataset.on = String(Boolean(settings[node.dataset.when as keyof Settings]));
  }
  document.documentElement.dataset.enabled = String(settings.enabled);
}

function readFocusHours(root: ParentNode, current: FocusHours): FocusHours {
  const field = (part: string) => root.querySelector<HTMLInputElement>(`input[data-focus="${part}"]`);
  const days = [...root.querySelectorAll<HTMLInputElement>('input[data-focus="day"]')].filter((d) => d.checked).map((d) => Number(d.value));
  return {
    on: field('on')?.checked ?? current.on,
    from: field('from')?.value || current.from,
    to: field('to')?.value || current.to,
    days,
  };
}

export function bindSettings(root: ParentNode, onSaved: (settings: Settings) => void, current: () => Settings): void {
  root.addEventListener('change', async (e) => {
    const input = e.target;
    let patch: Partial<Settings> | null = null;
    if (input instanceof HTMLSelectElement && input.dataset.selectSetting) {
      const key = input.dataset.selectSetting;
      patch = { [key]: key === 'dailyLimit' ? Number(input.value) : input.value };
    } else if (input instanceof HTMLInputElement) {
      if (input.dataset.setting) patch = { [input.dataset.setting]: input.checked };
      else if (input.dataset.radioSetting && input.checked) patch = { [input.dataset.radioSetting]: input.value };
      else if (input.dataset.focus) patch = { focusHours: readFocusHours(root, current().focusHours) };
    }
    if (patch) onSaved(await saveSettings(patch));
  });
}
