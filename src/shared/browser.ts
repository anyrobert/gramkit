// Firefox exposes promise-based `browser`; Chrome's MV3 `chrome` returns promises too.
export const api: typeof chrome = (globalThis as unknown as { browser?: typeof chrome }).browser ?? chrome;

export type Message = { type: 'open-options' };
