export const nf = new Intl.NumberFormat('lt-LT', { maximumFractionDigits: 0 });
export const nf1 = new Intl.NumberFormat('lt-LT', { maximumFractionDigits: 1 });
export const dateFmt = new Intl.DateTimeFormat('lt-LT', { weekday: 'long', month: 'long', day: 'numeric' });
export const wdFmt = new Intl.DateTimeFormat('lt-LT', { weekday: 'short' });
export const timeFmt = new Intl.DateTimeFormat('lt-LT', { hour: '2-digit', minute: '2-digit' });
export const stampFmt = new Intl.DateTimeFormat('lt-LT', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

/** 1 įrašas, 2 įrašai, 10 įrašų … */
export function countWord(n: number): string {
  const l = n % 10, h = n % 100;
  if (l === 1 && h !== 11) return n + ' įrašas';
  if (l === 0 || (h >= 10 && h <= 20)) return n + ' įrašų';
  return n + ' įrašai';
}

export function r1(x: number): number {
  return Math.round(x * 10) / 10;
}

export function newId(): string {
  return crypto.randomUUID();
}
