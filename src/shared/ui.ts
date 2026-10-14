// Binds popup / options controls to settings:
//   <input type="checkbox" data-setting="hideReels">
//   <input type="radio" name="audioMode" value="remember">

import { saveSettings, type AudioMode, type Settings } from './settings';

export const $ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) =>
  root.querySelector<T & Element>(selector) as T;

type Toggle = { key: keyof Settings; title: string; sub: string };

const VIDEO_TOGGLES: Toggle[] = [
  { key: 'controls', title: 'Control bar', sub: 'Seek, speed and volume on hover' },
  { key: 'speedPerSection', title: 'Speed per section', sub: 'Feed, Reels and Stories keep their own speed' },
];

const FOCUS_TOGGLES: Toggle[] = [
  { key: 'followingFeed', title: 'Open the Following feed', sub: 'Only people you follow, newest first' },
  { key: 'hideReels', title: 'Hide Reels', sub: 'Removes the tab and closes the Reels feed' },
  { key: 'hideExplore', title: 'Hide Explore', sub: 'Removes the tab and closes the Explore grid' },
  { key: 'hideSuggestions', title: 'Hide suggested accounts', sub: '“Suggested for you” lists' },
];

const AUDIO_MODES: { value: AudioMode; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'remember', label: 'Remember' },
  { value: 'unmute', label: 'Always on' },
];

function toggleRow({ key, title, sub }: Toggle): HTMLLabelElement {
  const row = document.createElement('label');
  row.className = 'row';
  row.innerHTML = `<span class="row-text"><span class="row-title"></span><span class="row-sub"></span></span>`;
  row.querySelector('.row-title')!.textContent = title;
  row.querySelector('.row-sub')!.textContent = sub;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'switch';
  input.dataset.setting = key;
  row.append(input);
  return row;
}

function soundRow(): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'row stack';
  row.innerHTML = `<span class="row-title">Sound</span><span class="row-sub">Instagram mutes every video. Remember keeps your last choice; Always on unmutes each one.</span><div class="seg" role="radiogroup" aria-label="Sound"></div>`;
  const seg = row.querySelector('.seg')!;
  for (const { value, label } of AUDIO_MODES) {
    const option = document.createElement('label');
    option.innerHTML = `<input type="radio" name="audioMode" data-radio-setting="audioMode"><span></span>`;
    option.querySelector('input')!.value = value;
    option.querySelector('span')!.textContent = label;
    seg.append(option);
  }
  return row;
}

/** Fills `[data-rows="video"]` and `[data-rows="focus"]` containers. */
export function buildRows(root: ParentNode = document): void {
  root.querySelector('[data-rows="video"]')?.append(...VIDEO_TOGGLES.map(toggleRow), soundRow());
  root.querySelector('[data-rows="focus"]')?.append(...FOCUS_TOGGLES.map(toggleRow));
}

export function renderSettings(root: ParentNode, settings: Settings): void {
  for (const input of root.querySelectorAll<HTMLInputElement>('input[data-setting]')) {
    input.checked = Boolean(settings[input.dataset.setting as keyof Settings]);
  }
  for (const radio of root.querySelectorAll<HTMLInputElement>('input[type=radio][data-radio-setting]')) {
    radio.checked = settings[radio.dataset.radioSetting as keyof Settings] === radio.value;
  }
  for (const node of root.querySelectorAll<HTMLElement>('[data-when]')) {
    node.dataset.on = String(Boolean(settings[node.dataset.when as keyof Settings]));
  }
  document.documentElement.dataset.enabled = String(settings.enabled);
}

export function bindSettings(root: ParentNode, onSaved: (settings: Settings) => void): void {
  root.addEventListener('change', async (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement)) return;
    let patch: Partial<Settings> | null = null;
    if (input.dataset.setting) patch = { [input.dataset.setting]: input.checked };
    else if (input.dataset.radioSetting && input.checked) patch = { [input.dataset.radioSetting]: input.value };
    if (patch) onSaved(await saveSettings(patch));
  });
}
