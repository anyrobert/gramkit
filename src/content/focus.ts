// Focus tools: the Following feed, hiding Reels / Explore / suggested accounts,
// Messages only (always, or during focus hours) and the daily time limit.
//
// Instagram's class names are generated and change often, so everything here
// keys off routes and links (`/reels/`, `/explore/`, `/explore/people/`),
// which have been stable for years and are the same in every language.

import { t } from '../shared/i18n';
import { addUsage, inFocusHours, loadUsage, onUsageChange, snoozeUsage, today, type Usage } from '../shared/settings';
import { el, hudRoot } from './hud';
import { store, subscribe } from './store';

const FOLLOWING = '/?variant=following';
const MESSAGES = '/direct/inbox/';
const HIDDEN_ATTR = 'data-gramkit-hidden';

const CSS = /* css */ `
html[data-gramkit-hide-reels] a[href="/reels/"],
html[data-gramkit-hide-explore] a[href="/explore/"],
html[data-gramkit-messages-only] a[href="/"],
html[data-gramkit-messages-only] a[href="/reels/"],
html[data-gramkit-messages-only] a[href="/explore/"] {
  display: none !important;
}
html[data-gramkit-hide-suggestions] [${HIDDEN_ATTR}="suggestions"] {
  display: none !important;
}
`;

function flags() {
  const s = store.settings;
  return {
    following: s.enabled && s.followingFeed,
    reels: s.enabled && s.hideReels,
    explore: s.enabled && s.hideExplore,
    suggestions: s.enabled && s.hideSuggestions,
    messagesOnly: s.enabled && (s.messagesOnly || inFocusHours(s.focusHours)),
  };
}

function isHome(url: URL): boolean {
  return url.pathname === '/' && !url.searchParams.has('variant');
}

/**
 * Sends blocked pages away. Only the Reels and Explore tab pages are blocked,
 * so a single reel or post opened from the feed, a profile or a link stays
 * open. `location.replace` reloads Instagram, so redirects that match `/`
 * never run on in-app URL changes (`pageLoad` false); in-app trips home go
 * through the Home link handler below.
 */
function guardRoute(pageLoad: boolean): void {
  const f = flags();
  const path = location.pathname;
  const url = new URL(location.href);
  if (f.messagesOnly) {
    if (path === '/reels/' || path === '/explore/' || (pageLoad && path === '/')) location.replace(MESSAGES);
    return;
  }
  if ((f.reels && path === '/reels/') || (f.explore && path === '/explore/')) {
    location.replace(f.following ? FOLLOWING : '/');
  } else if (pageLoad && f.following && isHome(url)) {
    location.replace(FOLLOWING);
  }
}

/**
 * The "See all" link of a suggestions block points to /explore/people/. Walk up
 * from it to the row that holds the heading; the list of accounts is the row's
 * next sibling. When both share a parent with nothing else, hide the parent.
 */
function markSuggestions(): void {
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href^="/explore/people/"]')) {
    if (link.closest(`[${HIDDEN_ATTR}]`)) continue;
    let row: HTMLElement | null = link.parentElement;
    for (let depth = 0; row && depth < 8; depth++, row = row.parentElement) {
      const list = row.nextElementSibling;
      if (list instanceof HTMLElement && list.querySelectorAll('a[href^="/"]').length >= 2) {
        const parent = row.parentElement;
        if (parent && parent.childElementCount === 2 && parent !== document.body) {
          parent.setAttribute(HIDDEN_ATTR, 'suggestions');
        } else {
          row.setAttribute(HIDDEN_ATTR, 'suggestions');
          list.setAttribute(HIDDEN_ATTR, 'suggestions');
        }
        break;
      }
    }
  }
}

function applyFlags(): void {
  const f = flags();
  const html = document.documentElement;
  html.toggleAttribute('data-gramkit-hide-reels', f.reels);
  html.toggleAttribute('data-gramkit-hide-explore', f.explore);
  html.toggleAttribute('data-gramkit-hide-suggestions', f.suggestions);
  html.toggleAttribute('data-gramkit-messages-only', f.messagesOnly);
}

// Daily time limit ------------------------------------------------------------------

const FLUSH_MS = 15_000;
const SNOOZE_MS = 5 * 60_000;

function installLimit(): void {
  let usage: Usage | null = null;
  let pending = 0;
  let lastFlush = Date.now();
  let overlay: HTMLDivElement | null = null;

  void loadUsage().then((u) => (usage = u));
  onUsageChange((u) => {
    usage = u;
    check();
  });

  const flush = () => {
    if (!pending) return;
    const seconds = pending;
    pending = 0;
    lastFlush = Date.now();
    void addUsage(seconds);
  };

  const hide = () => {
    overlay?.remove();
    overlay = null;
  };

  const show = (minutes: number, limit: number) => {
    if (overlay) return;
    for (const video of document.querySelectorAll('video')) video.pause();
    overlay = el('div', 'limit');
    overlay.setAttribute('role', 'alertdialog');
    const card = el('div', 'limit-card');
    card.append(
      el('h2', '', t('Time’s up for today')),
      el('p', '', t('You’ve spent {m} minutes on Instagram today. Your limit is {limit} minutes. Messages stay open.', { m: minutes, limit })),
    );
    const actions = el('div', 'limit-actions');
    const messages = el('button', 'limit-btn hot', t('Open Messages'));
    messages.type = 'button';
    messages.addEventListener('click', () => location.assign(MESSAGES));
    const more = el('button', 'limit-btn', t('5 more minutes'));
    more.type = 'button';
    more.addEventListener('click', () => {
      flush();
      if (usage) usage = { ...usage, snoozeUntil: Date.now() + SNOOZE_MS };
      void snoozeUsage(SNOOZE_MS);
      hide();
    });
    actions.append(messages, more);
    card.append(actions);
    overlay.append(card);
    overlay.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
    overlay.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    hudRoot().append(overlay);
  };

  const check = () => {
    const limit = store.settings.dailyLimit;
    if (!store.settings.enabled || !limit || !usage || location.pathname.startsWith('/direct/') || Date.now() < usage.snoozeUntil) {
      hide();
      return;
    }
    const seconds = (usage.day === today() ? usage.seconds : 0) + pending;
    if (seconds >= limit * 60) show(Math.floor(seconds / 60), limit);
    else hide();
  };

  setInterval(() => {
    if (document.visibilityState === 'visible' && document.hasFocus()) pending++;
    if (Date.now() - lastFlush >= FLUSH_MS) flush();
    check();
    if (overlay) for (const video of document.querySelectorAll('video')) if (!video.paused) video.pause();
  }, 1000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  window.addEventListener('pagehide', flush);
  subscribe(check);
}

export function installFocus(): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.documentElement.append(style);

  applyFlags();
  guardRoute(true);
  subscribe((prev) => {
    if (prev.settings === store.settings) return;
    applyFlags();
    guardRoute(true);
    if (flags().suggestions) markSuggestions();
  });

  // Instagram navigates with pushState from its own JavaScript world, which a
  // content script can't hook, so watch the URL instead. Focus hours start and
  // end on their own, so the flags are re-checked too.
  let lastHref = location.href;
  let lastMessagesOnly = flags().messagesOnly;
  setInterval(() => {
    const messagesOnly = flags().messagesOnly;
    if (messagesOnly !== lastMessagesOnly) {
      lastMessagesOnly = messagesOnly;
      applyFlags();
      guardRoute(true);
    }
    if (location.href === lastHref) return;
    lastHref = location.href;
    guardRoute(false);
  }, 250);

  // Clicking Instagram's Home link: go straight to Following (or Messages) instead of loading Home first.
  document.addEventListener(
    'click',
    (e) => {
      const f = flags();
      if (!(f.following || f.messagesOnly) || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const link = (e.target as Element | null)?.closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement) || !isHome(new URL(link.href))) return;
      e.preventDefault();
      e.stopPropagation();
      location.assign(f.messagesOnly ? MESSAGES : FOLLOWING);
    },
    true,
  );

  let queued = false;
  const scan = () => {
    if (queued || !flags().suggestions) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      markSuggestions();
    });
  };
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  scan();
  document.addEventListener('DOMContentLoaded', scan);

  installLimit();
}
