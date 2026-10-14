// UI text. English strings are the keys; other languages map them to a
// translation and fall back to English for anything missing.
//
//   t('Volume {n}%', { n: 40 })
//   <span data-i18n>Speed</span>            text nodes are translated
//   <button data-i18n-attr="aria-label">    so are the listed attributes

import { PT } from './i18n-pt';
import type { Language } from './settings';

type Lang = 'en' | 'pt';
const DICTIONARIES: Record<Lang, Record<string, string>> = { en: {}, pt: PT };

function detect(): Lang {
  return (navigator.language || 'en').toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

let lang: Lang = detect();

export function setLanguage(preference: Language): void {
  lang = preference === 'auto' ? detect() : preference;
}

export function currentLanguage(): Lang {
  return lang;
}

export function t(text: string, vars?: Record<string, string | number>): string {
  let out = DICTIONARIES[lang][text] ?? text;
  if (vars) for (const [key, value] of Object.entries(vars)) out = out.replaceAll(`{${key}}`, String(value));
  return out;
}

const originalText = new WeakMap<Text, string>();
const originalAttr = new WeakMap<Element, Map<string, string>>();

/** Translates marked static markup; safe to call again after a language change. */
export function translatePage(root: ParentNode = document): void {
  for (const node of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    for (const child of node.childNodes) {
      if (!(child instanceof Text)) continue;
      const source = originalText.get(child) ?? child.textContent ?? '';
      if (!source.trim()) continue;
      originalText.set(child, source);
      const lead = /^\s*/.exec(source)![0];
      const tail = /\s*$/.exec(source)![0];
      child.textContent = `${lead}${t(source.trim())}${tail}`;
    }
  }
  for (const node of root.querySelectorAll<HTMLElement>('[data-i18n-attr]')) {
    const saved = originalAttr.get(node) ?? new Map<string, string>();
    for (const name of node.dataset.i18nAttr!.split(',')) {
      const source = saved.get(name) ?? node.getAttribute(name);
      if (source == null) continue;
      saved.set(name, source);
      node.setAttribute(name, t(source));
    }
    originalAttr.set(node, saved);
  }
  if (root === document) document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
}
