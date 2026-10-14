import { installControls } from './controls';
import { installFocus } from './focus';
import { installMedia } from './media';
import { installShortcuts } from './shortcuts';
import { initStore } from './store';

// Listeners go in at document_start so the first video's events aren't missed;
// they read settings from the store, which fills in a moment later.
installMedia();
installShortcuts();
installControls();
void initStore().then(installFocus);
