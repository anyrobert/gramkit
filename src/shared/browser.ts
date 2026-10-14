// Firefox exposes promise-based `browser`; Chrome's MV3 `chrome` returns promises too.
export const api: typeof chrome = (globalThis as unknown as { browser?: typeof chrome }).browser ?? chrome;

/** A file to save under Downloads/Gramkit/. `url` may be a data: URL. */
export type DownloadFile = { url: string; filename: string };

export type Message = { type: 'open-options' } | { type: 'download'; files: DownloadFile[] };

export type DownloadResult = { ok: number; failed: number };
