// One shadow root, attached to <html> outside Instagram's React tree, holds
// everything we draw: the toast, the control bar and the shortcut overlay.
// Being outside the React root means Instagram never sees our clicks; we still
// stop them at the host so document-level handlers don't either.

import { ACTIONS, GROUPS, keysFor } from '../shared/actions';
import { api, type Message } from '../shared/browser';
import { t } from '../shared/i18n';
import { comboLabels, THEN } from '../shared/keys';
import { HUD_CSS } from './hud.css';
import { store } from './store';

let root: ShadowRoot | null = null;

export function hudRoot(): ShadowRoot {
  if (root) return root;
  const host = document.createElement('gramkit-hud');
  host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483646; pointer-events: none;';
  root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = HUD_CSS;
  root.append(style);
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel']) {
    host.addEventListener(type, (e) => e.stopPropagation());
  }
  document.documentElement.append(host);
  // Instagram's own fullscreen viewers can remove stray nodes; put the host back.
  new MutationObserver(() => {
    if (!host.isConnected) document.documentElement.append(host);
  }).observe(document.documentElement, { childList: true });
  return root;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// Toast ---------------------------------------------------------------------

let toastNode: HTMLDivElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** Shows a short readout ("1.5×", "+5s", "Volume 60%") centred on the video. */
export function toast(text: string, video?: HTMLVideoElement | null, detail?: string): void {
  if (!toastNode) {
    toastNode = el('div', 'toast');
    toastNode.setAttribute('role', 'status');
    hudRoot().append(toastNode);
  }
  const rect = video?.getBoundingClientRect();
  const x = rect ? rect.left + rect.width / 2 : innerWidth / 2;
  const y = rect ? rect.top + Math.min(rect.height / 2, innerHeight / 2) : innerHeight / 2;
  toastNode.style.left = `${Math.min(Math.max(x, 80), innerWidth - 80)}px`;
  toastNode.style.top = `${Math.min(Math.max(y, 60), innerHeight - 60)}px`;
  toastNode.replaceChildren(el('span', 'toast-main', text), ...(detail ? [el('span', 'toast-detail', detail)] : []));
  toastNode.classList.remove('show');
  void toastNode.offsetWidth;
  toastNode.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastNode?.classList.remove('show'), 750);
}

// Shortcut overlay ------------------------------------------------------------

let helpNode: HTMLDivElement | null = null;

export function isHelpOpen(): boolean {
  return !!helpNode;
}

export function closeHelp(): void {
  helpNode?.remove();
  helpNode = null;
}

export function toggleHelp(): void {
  if (helpNode) return closeHelp();
  const overlay = el('div', 'help');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', t('Gramkit keyboard shortcuts'));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeHelp();
  });

  const card = el('div', 'help-card');
  const head = el('div', 'help-head');
  head.append(el('h2', '', t('Keyboard shortcuts')), el('span', 'help-sub', 'Gramkit'));
  card.append(head);

  const grid = el('div', 'help-grid');
  for (const group of GROUPS) {
    const section = el('section');
    section.append(el('h3', '', t(group)));
    for (const action of ACTIONS.filter((a) => a.group === group)) {
      const keys = keysFor(action.id, store.settings.keymap);
      const row = el('div', 'help-row');
      const caps = el('span', 'caps');
      if (!keys.length) caps.append(el('span', 'unbound', t('not set')));
      keys.forEach((combo, i) => {
        if (i) caps.append(el('span', 'or', t('or')));
        for (const label of comboLabels(combo)) caps.append(label === THEN ? el('span', 'then', t('then')) : el('kbd', '', label));
      });
      row.append(el('span', 'label', t(action.label)), caps);
      section.append(row);
    }
    grid.append(section);
  }
  card.append(grid);

  const foot = el('div', 'help-foot');
  foot.append(el('p', '', t('Arrow keys and Space act on a video only while the pointer is over it. On Reels, ↑ and ↓ still move between reels. In Stories, the arrows stay Instagram’s.')));
  const customize = el('button', 'help-btn', t('Customize shortcuts'));
  customize.type = 'button';
  customize.addEventListener('click', () => {
    void api.runtime.sendMessage({ type: 'open-options' } satisfies Message);
    closeHelp();
  });
  foot.append(customize);
  card.append(foot);

  overlay.append(card);
  hudRoot().append(overlay);
  helpNode = overlay;
}
