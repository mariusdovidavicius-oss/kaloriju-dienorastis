// Open Food Facts – atvira prekių duomenų bazė (brūkšniniai kodai, etiketės vertės).
// https://world.openfoodfacts.org – nemokama, be rakto. Vertės 100 g.
import type { Product } from '../types';

const BASE = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,product_name_lt,product_name_en,brands,nutriments,serving_quantity';

interface OffProduct {
  code?: string; product_name?: string; product_name_lt?: string; product_name_en?: string; brands?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
}

const n = (v: unknown) => { const x = parseFloat(String(v ?? '')); return Number.isFinite(x) && x >= 0 ? x : NaN; };
const r1 = (x: number) => Math.round(x * 10) / 10;

/** OFF įrašas → produktas su vertėmis 100 g. null – jei trūksta kalorijų. */
export function offToProduct(p: OffProduct, lang: 'lt' | 'en'): Product | null {
  const m = p.nutriments || {};
  let kcal = n(m['energy-kcal_100g']);
  if (isNaN(kcal)) { const kj = n(m['energy_100g']); if (!isNaN(kj)) kcal = kj / 4.184; }
  if (isNaN(kcal)) return null;
  const name = (lang === 'lt' ? p.product_name_lt || p.product_name : p.product_name_en || p.product_name) || p.product_name_lt || p.product_name_en || '';
  const brand = (p.brands || '').split(',')[0].trim();
  const full = (brand && !name.toLowerCase().includes(brand.toLowerCase()) ? brand + ' ' : '') + name;
  if (!full.trim()) return null;
  return {
    id: 'off:' + (p.code || Math.random().toString(36).slice(2)), name: full.trim().slice(0, 80), unit: '100 g', grams: 100,
    kcal: r1(kcal), protein: r1(n(m['proteins_100g']) || 0), carbs: r1(n(m['carbohydrates_100g']) || 0), fat: r1(n(m['fat_100g']) || 0),
  };
}

export class OffError extends Error { constructor(public code: 'notfound' | 'network' | 'nodata') { super(code); } }

/** Prekė pagal brūkšninį kodą. */
export async function offByBarcode(code: string, lang: 'lt' | 'en'): Promise<Product> {
  let res: Response;
  try { res = await fetch(BASE + '/api/v2/product/' + encodeURIComponent(code) + '.json?fields=' + FIELDS); } catch { throw new OffError('network'); }
  if (res.status === 404) throw new OffError('notfound');
  if (!res.ok) throw new OffError('network');
  const j = await res.json().catch(() => null) as { status?: number; product?: OffProduct } | null;
  if (!j || j.status === 0 || !j.product) throw new OffError('notfound');
  const p = offToProduct({ ...j.product, code }, lang);
  if (!p) throw new OffError('nodata');
  return p;
}

/** Prekių paieška pagal pavadinimą (lėtesnė, iki 15 rezultatų). */
export async function offSearch(q: string, lang: 'lt' | 'en'): Promise<Product[]> {
  let res: Response;
  try {
    res = await fetch(BASE + '/cgi/search.pl?search_simple=1&json=1&page_size=15&search_terms=' + encodeURIComponent(q) + '&fields=' + FIELDS);
  } catch { throw new OffError('network'); }
  if (!res.ok) throw new OffError('network');
  const j = await res.json().catch(() => null) as { products?: OffProduct[] } | null;
  return (j?.products || []).map((p) => offToProduct(p, lang)).filter((p): p is Product => !!p);
}
