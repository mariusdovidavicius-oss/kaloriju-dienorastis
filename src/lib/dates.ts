/** Datos eilutės formatu YYYY-MM-DD vietos laiku. */
export function dstr(d: Date): string {
  const z = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}

export function parseD(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseD(s);
  d.setDate(d.getDate() + n);
  return dstr(d);
}

export function today(): string {
  return dstr(new Date());
}

/** Paskutinių n dienų sąrašas, baigiant šiandiena. */
export function periodDays(n: number, end = today()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(end, -i));
  return out;
}
