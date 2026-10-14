import { api } from '../shared/browser';
import { setLanguage, t, translatePage } from '../shared/i18n';
import {
  loadPlayback,
  loadUsage,
  onUsageChange,
  loadSettings,
  onPlaybackChange,
  onSettingsChange,
  savePlayback,
  sectionOf,
  speedFor,
  stepSpeed,
  withSpeed,
  type Playback,
  type Section,
  type Settings,
  type Usage,
} from '../shared/settings';
import { $, bindSettings, buildRows, renderSettings } from '../shared/ui';

const PRESETS = [0.5, 1, 1.25, 1.5, 2, 3];
const SCOPE: Record<Section, string> = { feed: 'Feed and posts', reels: 'Reels', stories: 'Stories' };

const readout = $<HTMLOutputElement>('#readout');
const scope = $('#scope');
const usageNode = $('#usage');
const presets = $('#presets');

let settings: Settings;
let playback: Playback;
let section: Section = 'feed';

function render(): void {
  renderSettings(document, settings);
  const rate = speedFor(settings, playback, section);
  const text = rate.toFixed(2);
  const value = readout.firstChild;
  if (value?.textContent !== text) {
    if (value) value.textContent = text;
    readout.classList.remove('bump');
    void readout.offsetWidth;
    readout.classList.add('bump');
  }
  readout.classList.toggle('hot', rate !== 1);
  scope.textContent = t(settings.speedPerSection ? SCOPE[section] : 'All videos');
  for (const button of presets.children) {
    button.setAttribute('aria-pressed', String(Number((button as HTMLElement).dataset.rate) === rate));
  }
}

function renderUsage(usage: Usage): void {
  const minutes = Math.floor(usage.seconds / 60);
  usageNode.textContent = settings.dailyLimit
    ? t('Today: {m} of {limit} min', { m: minutes, limit: settings.dailyLimit })
    : t('Today: {m} min on Instagram', { m: minutes });
}

async function setRate(rate: number): Promise<void> {
  playback = { ...playback, ...withSpeed(settings, playback, section, rate) };
  render();
  await savePlayback(playback);
}

async function main(): Promise<void> {
  [settings, playback] = await Promise.all([loadSettings(), loadPlayback()]);
  setLanguage(settings.language);
  translatePage();
  buildRows();
  for (const rate of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset';
    b.dataset.rate = String(rate);
    b.textContent = `${rate}×`;
    b.addEventListener('click', () => void setRate(rate));
    presets.append(b);
  }

  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    const url = new URL(tab.url);
    if (url.hostname === 'www.instagram.com') section = sectionOf(url.pathname);
  }
  render();

  bindSettings(
    document,
    (next) => {
      settings = next;
      render();
    },
    () => settings,
  );
  onSettingsChange((next) => {
    const relabel = next.language !== settings.language;
    settings = next;
    if (relabel) {
      setLanguage(settings.language);
      translatePage();
      buildRows();
    }
    render();
    void loadUsage().then(renderUsage);
  });
  void loadUsage().then(renderUsage);
  onUsageChange(renderUsage);
  onPlaybackChange((next) => {
    playback = next;
    render();
  });

  $('#slower').addEventListener('click', () => void setRate(stepSpeed(speedFor(settings, playback, section), -1)));
  $('#faster').addEventListener('click', () => void setRate(stepSpeed(speedFor(settings, playback, section), 1)));
  $('#shortcuts').addEventListener('click', () => {
    void api.runtime.openOptionsPage();
    window.close();
  });
  $('#version').textContent = `v${api.runtime.getManifest().version}`;
}

void main();
