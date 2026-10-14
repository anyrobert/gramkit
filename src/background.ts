import { api, type Message } from './shared/browser';

api.runtime.onMessage.addListener((message: Message) => {
  if (message?.type === 'open-options') void api.runtime.openOptionsPage();
});
