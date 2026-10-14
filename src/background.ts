import { api, type DownloadFile, type DownloadResult, type Message } from './shared/browser';

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

async function download(files: DownloadFile[]): Promise<DownloadResult> {
  const result: DownloadResult = { ok: 0, failed: 0 };
  for (const file of files) {
    try {
      await api.downloads.download({
        url: await downloadUrl(file.url),
        filename: `Gramkit/${safeName(file.filename)}`,
        conflictAction: 'uniquify',
      });
      result.ok++;
    } catch {
      result.failed++;
    }
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
