import { setLanguage } from '../shared/i18n';
import { installControls } from './controls';
import { installFocus } from './focus';
import { installMedia } from './media';
import { installNav } from './nav';
import { installShortcuts } from './shortcuts';
import { initStore, store, subscribe } from './store';

// Listeners go in at document_start so the first video's events aren't missed;
// they read settings from the store, which fills in a moment later. The
// language goes first so other listeners already see it.
subscribe(() => setLanguage(store.settings.language));
installMedia();
installShortcuts();
installControls();
void initStore().then(() => {
  installFocus();
  installNav();
});
