// "Go to" targets and the profiles the user opens. Clicking Instagram's own
// link when there is one keeps navigation in-app; otherwise load the page.

import { t } from '../shared/i18n';
import { rememberProfile } from '../shared/settings';
import { toast } from './hud';
import { openSearch, profilePath } from './posts';

export type Place = 'home' | 'messages' | 'explore' | 'reels' | 'profile' | 'saved' | 'search';

/** The signed-in user's name, from the profile link (the one with an avatar) in Instagram's sidebar. */
export function ownUsername(): string | null {
  for (const link of document.querySelectorAll<HTMLAnchorElement>('nav a[href], [role="navigation"] a[href], a[href][role="link"]')) {
    if (!link.querySelector('img')) continue;
    const name = profilePath(link.href);
    if (name) return name;
  }
  return null;
}

export function openPath(path: string): void {
  const link = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].find((a) => {
    const url = new URL(a.href, location.href);
    return url.hostname === location.hostname && url.pathname + url.search === path && a.getClientRects().length;
  });
  if (link) link.click();
  else location.assign(path);
}

export function goTo(place: Place): void {
  if (place === 'search') {
    openSearch();
    return;
  }
  if (place === 'profile' || place === 'saved') {
    const me = ownUsername();
    if (!me) {
      toast(t('Couldn’t find your profile'));
      return;
    }
    openPath(place === 'profile' ? `/${me}/` : `/${me}/saved/`);
    return;
  }
  const paths: Record<Exclude<Place, 'profile' | 'saved' | 'search'>, string> = {
    home: '/',
    messages: '/direct/inbox/',
    explore: '/explore/',
    reels: '/reels/',
  };
  openPath(paths[place]);
}

export function installNav(): void {
  let last = '';
  const check = () => {
    if (location.pathname === last) return;
    last = location.pathname;
    const name = profilePath(location.href);
    if (name && name !== ownUsername()) void rememberProfile(name);
  };
  check();
  setInterval(check, 500);
}
