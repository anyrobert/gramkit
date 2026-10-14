// Focus tools: open the Following feed, hide Reels / Explore, hide suggested accounts.
//
// Instagram's class names are generated and change often, so everything here
// keys off routes and links (`/reels/`, `/explore/`, `/explore/people/`),
// which have been stable for years and are the same in every language.

import { store, subscribe } from './store';

const FOLLOWING = '/?variant=following';
const HIDDEN_ATTR = 'data-gramkit-hidden';

const CSS = /* css */ `
html[data-gramkit-hide-reels] a[href="/reels/"],
html[data-gramkit-hide-explore] a[href="/explore/"] {
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
  };
}

function isHome(url: URL): boolean {
  return url.pathname === '/' && !url.searchParams.has('variant');
}

/** Sends blocked pages home. Returns true when it navigated away. */
function guardRoute(): boolean {
  const f = flags();
  const path = location.pathname;
  const home = f.following ? FOLLOWING : '/';
  if ((f.reels && path.startsWith('/reels/')) || (f.explore && path === '/explore/')) {
    location.replace(home);
    return true;
  }
  if (f.following && isHome(new URL(location.href))) {
    location.replace(FOLLOWING);
    return true;
  }
  return false;
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
}

export function installFocus(): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.documentElement.append(style);

  applyFlags();
  guardRoute();
  subscribe(() => {
    applyFlags();
    guardRoute();
    if (flags().suggestions) markSuggestions();
  });

  // Instagram navigates with pushState from its own JavaScript world, which a
  // content script can't hook, so watch the URL instead.
  let lastHref = location.href;
  setInterval(() => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    guardRoute();
  }, 250);

  // Clicking Instagram's Home link: go straight to Following instead of loading Home first.
  document.addEventListener(
    'click',
    (e) => {
      if (!flags().following || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const link = (e.target as Element | null)?.closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement) || !isHome(new URL(link.href))) return;
      e.preventDefault();
      e.stopPropagation();
      location.assign(FOLLOWING);
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
}
