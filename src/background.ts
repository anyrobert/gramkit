import { api, type DownloadFile, type DownloadResult, type Message } from './shared/browser';
import { loadSettings } from './shared/settings';

type Outcome = 'ok' | 'failed' | 'canceled';

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^\.+/, '').slice(0, 150) || 'instagram';
}

// Chrome's service worker can download data: URLs but has no createObjectURL;
// Firefox refuses data: URLs but its event page can make blob: URLs.
async function downloadUrl(url: string): Promise<string> {
  if (!url.startsWith('data:') || typeof URL.createObjectURL !== 'function') return url;
  const blob = await (await fetch(url)).blob();
  return URL.createObjectURL(blob);
}

// Chrome starts a download before its save dialog and only cancels it after;
// Firefox resolves after the dialog. Either way the item settles once it has a
// file name, or ends interrupted or erased when the dialog is closed.
function settled(id: number): Promise<Outcome> {
  return new Promise((resolve) => {
    const finish = (outcome: Outcome) => {
      api.downloads.onChanged.removeListener(changed);
      api.downloads.onErased.removeListener(erased);
      resolve(outcome);
    };
    const check = (filename?: string, state?: string, error?: string) => {
      if (state === 'interrupted') finish(error === 'USER_CANCELED' ? 'canceled' : 'failed');
      else if (filename || state === 'complete') finish('ok');
    };
    const changed = (delta: chrome.downloads.DownloadDelta) => {
      if (delta.id === id) check(delta.filename?.current, delta.state?.current, delta.error?.current);
    };
    const erased = (erasedId: number) => {
      if (erasedId === id) finish('canceled');
    };
    api.downloads.onChanged.addListener(changed);
    api.downloads.onErased.addListener(erased);
    void api.downloads.search({ id }).then(
      ([item]) => (item ? check(item.filename, item.state, item.error) : finish('canceled')),
      () => finish('failed'),
    );
  });
}

async function save(file: DownloadFile, folder: boolean, ask: boolean): Promise<Outcome> {
  try {
    const id = await api.downloads.download({
      url: await downloadUrl(file.url),
      filename: folder ? `Gramkit/${safeName(file.filename)}` : safeName(file.filename),
      conflictAction: 'uniquify',
      ...(ask && { saveAs: true }),
    });
    return await settled(id);
  } catch (e) {
    // Firefox rejects with "Download canceled by the user" when the dialog is closed.
    return /cancel/i.test(String((e as Error)?.message ?? e)) ? 'canceled' : 'failed';
  }
}

async function download(files: DownloadFile[]): Promise<DownloadResult> {
  const { gramkitFolder, askWhereToSave } = await loadSettings();
  const result: DownloadResult = { ok: 0, failed: 0, canceled: 0 };
  for (const file of files) {
    const outcome = await save(file, gramkitFolder, askWhereToSave);
    result[outcome]++;
    // Closing one save dialog stops the rest of a carousel too.
    if (outcome === 'canceled') break;
  }
  return result;
}

api.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message?.type === 'open-options') void api.runtime.openOptionsPage();
  if (message?.type === 'download') {
    void download(message.files).then(sendResponse);
    return true;
  }
  return undefined;
});
