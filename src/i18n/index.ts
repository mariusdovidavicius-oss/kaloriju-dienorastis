// Kalbos: lietuvių (numatyta) ir anglų.
import { en } from './en';
import { lt, type Dict } from './lt';

export type Lang = 'lt' | 'en';
export const LANGS: { code: Lang; label: string }[] = [{ code: 'lt', label: 'Lietuvių' }, { code: 'en', label: 'English' }];
const DICTS: Record<Lang, Dict> = { lt, en };
const LS_KEY = 'kd-lang';

let current: Lang = detect();

function detect(): Lang {
  try { const v = localStorage.getItem(LS_KEY); if (v === 'lt' || v === 'en') return v; } catch { /* privatus režimas */ }
  const nav = (typeof navigator !== 'undefined' && navigator.language) || 'lt';
  return nav.toLowerCase().startsWith('lt') ? 'lt' : 'en';
}

export function lang(): Lang { return current; }
export function locale(): string { return current === 'lt' ? 'lt-LT' : 'en-GB'; }

/** Pakeičia kalbą (išsaugo šiame įrenginyje). Grąžina true, jei pasikeitė. */
export function setLang(l: Lang): boolean {
  if (l !== 'lt' && l !== 'en') return false;
  try { localStorage.setItem(LS_KEY, l); } catch { /* nesvarbu */ }
  if (l === current) return false;
  current = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  listeners.forEach((f) => f());
  return true;
}

const listeners: (() => void)[] = [];
export function onLangChange(f: () => void) { listeners.push(f); }

export type Key = keyof Dict;

/** Tekstas pagal raktą; {x} pakeičiami reikšmėmis. */
export function t(key: Key, vars?: Record<string, string | number>): string {
  let s = DICTS[current][key] ?? lt[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split('{' + k + '}').join(String(v));
  return s;
}

/** Įrašų skaičius su teisinga galūne. */
export function countEntries(n: number): string {
  if (current === 'en') return t(n === 1 ? 'entries1' : 'entriesMany', { n });
  const l = n % 10, h = n % 100;
  if (l === 1 && h !== 11) return t('entries1', { n });
  if (l === 0 || (h >= 10 && h <= 20)) return t('entriesMany', { n });
  return t('entriesFew', { n });
}

if (typeof document !== 'undefined') document.documentElement.lang = current;
