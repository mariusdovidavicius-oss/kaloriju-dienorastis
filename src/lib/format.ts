import { locale } from '../i18n';

// Skaičių ir datų formatai pagal pasirinktą kalbą (lt-LT arba en-GB).
const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();
function get<T extends Intl.NumberFormat | Intl.DateTimeFormat>(key: string, make: (loc: string) => T): T {
  const loc = locale(), k = loc + '|' + key;
  let f = cache.get(k) as T | undefined;
  if (!f) { f = make(loc); cache.set(k, f); }
  return f;
}

/** Sveikas skaičius su tūkstančių skyrikliu. */
export const nf = (x: number) => get('n0', (l) => new Intl.NumberFormat(l, { maximumFractionDigits: 0 })).format(x);
/** Skaičius su vienu skaitmeniu po kablelio. */
export const nf1 = (x: number) => get('n1', (l) => new Intl.NumberFormat(l, { maximumFractionDigits: 1 })).format(x);
export const fmtDate = (d: Date) => get('date', (l) => new Intl.DateTimeFormat(l, { weekday: 'long', month: 'long', day: 'numeric' })).format(d);
export const fmtWeekday = (d: Date) => get('wd', (l) => new Intl.DateTimeFormat(l, { weekday: 'short' })).format(d).replace('.', '');
export const fmtTime = (t: number) => get('time', (l) => new Intl.DateTimeFormat(l, { hour: '2-digit', minute: '2-digit' })).format(new Date(t));
export const fmtStamp = (t: number) => get('stamp', (l) => new Intl.DateTimeFormat(l, { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })).format(new Date(t));
export const fmtMonth = (d: Date) => get('month', (l) => new Intl.DateTimeFormat(l, { month: 'long', year: 'numeric' })).format(d);

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

export function r1(x: number): number {
  return Math.round(x * 10) / 10;
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Didžioji pirma raidė. */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
