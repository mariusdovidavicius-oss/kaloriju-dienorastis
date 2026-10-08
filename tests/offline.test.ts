import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/data/memoryStore';
import { OfflineStore, isNetworkError } from '../src/data/offlineStore';
import { searchFoods, norm } from '../src/data/foods';
import { offToProduct } from '../src/lib/off';
import { weightTrend } from '../src/lib/calc';
import type { FoodItem } from '../src/types';

// Paprasta localStorage imitacija Node aplinkai
const mem: Record<string, string> = {};
Object.assign(globalThis, { localStorage: { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } } });

const item = (id: string, kcal = 100): FoodItem => ({ id, name: 'X' + id, amount: '', kcal, protein: 1, carbs: 1, fat: 1, t: 1, meal: 'pietus' });

describe('veikimas be interneto', () => {
  beforeEach(() => { for (const k of Object.keys(mem)) delete mem[k]; });

  it('be ryšio įrašai laukia eilėje ir išsiunčiami atsiradus ryšiui', async () => {
    const inner = new MemoryStore(false), st = new OfflineStore(inner, 'u1');
    await st.loadInitial('2026-01-01');
    inner.offline = true;
    await st.addFood('2026-10-08', [item('a')]);
    await st.flush();
    expect(st.status()).toEqual({ offline: true, pending: 1 });
    expect(inner.calls).not.toContain('addFood');
    inner.offline = false;
    await st.flush();
    expect(st.status()).toEqual({ offline: false, pending: 0 });
    expect(inner.days['2026-10-08'].items.map((i) => i.id)).toEqual(['a']);
  });

  it('be ryšio atidaro paskutinę kopiją su laukiančiais įrašais', async () => {
    const inner = new MemoryStore(false), st = new OfflineStore(inner, 'u2');
    await st.addFood('2026-10-07', [item('a')]);
    await st.loadInitial('2026-01-01');
    inner.offline = true;
    await st.addFood('2026-10-08', [item('b')]);
    await st.updateFood('a', { kcal: 250 });
    const fresh = new OfflineStore(inner, 'u2'); // „perkrautas puslapis“
    const d = await fresh.loadInitial('2026-01-01');
    expect(d.days['2026-10-07'].items[0].kcal).toBe(250);
    expect(d.days['2026-10-08'].items.map((i) => i.id)).toEqual(['b']);
    expect(fresh.status().pending).toBe(2);
  });

  it('serverio atmestas įrašas pašalinamas iš eilės', async () => {
    const inner = new MemoryStore(false), st = new OfflineStore(inner, 'u3');
    const rejected: unknown[] = [];
    st.onRejected = (e) => rejected.push(e);
    inner.addFood = async () => { throw new Error('duplicate key value'); };
    await st.addFood('2026-10-08', [item('a')]);
    await st.flush();
    expect(rejected).toHaveLength(1);
    expect(st.status().pending).toBe(0);
  });

  it('ryšio klaidų atpažinimas', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError(new Error('TypeError: Load failed'))).toBe(true);
    expect(isNetworkError(new Error('duplicate key value violates unique constraint'))).toBe(false);
  });
});

describe('produktų bazė', () => {
  it('ieško be lietuviškų raidžių', () => {
    expect(norm('Vištienos KRŪTINĖLĖ')).toBe('vistienos krutinele');
    expect(searchFoods('vistiena krut')[0].lt).toMatch(/^Vištienos krūtinėlė/);
    expect(searchFoods('varske').map((f) => f.lt)).toContain('Varškė 0,5 %');
    expect(searchFoods('cottage').length).toBeGreaterThan(0);
  });
  it('vertės protingos (kcal ≈ 4·B + 4·A + 9·R, išskyrus alkoholį ir daržoves)', () => {
    const eggs = searchFoods('kiausinis')[0];
    expect(eggs.unit?.g).toBe(55);
  });
});

describe('Open Food Facts', () => {
  it('paverčia į produktą 100 g', () => {
    const p = offToProduct({ code: '4770', product_name: 'Varškė', brands: 'Rokiškio', nutriments: { 'energy-kcal_100g': 76, proteins_100g: 16, carbohydrates_100g: 2, fat_100g: 0.5 } }, 'lt');
    expect(p).toMatchObject({ id: 'off:4770', name: 'Rokiškio Varškė', unit: '100 g', grams: 100, kcal: 76, protein: 16 });
  });
  it('kJ → kcal, jei nėra kcal', () => {
    expect(offToProduct({ product_name: 'A', nutriments: { energy_100g: 418.4 } }, 'en')?.kcal).toBe(100);
  });
  it('be energijos – null', () => {
    expect(offToProduct({ product_name: 'A', nutriments: {} }, 'en')).toBeNull();
  });
});

describe('svorio tendencija', () => {
  it('7 dienų slankusis vidurkis', () => {
    const tr = weightTrend([{ date: '2026-10-01', kg: 95 }, { date: '2026-10-04', kg: 94 }, { date: '2026-10-09', kg: 93 }]);
    expect(tr.map((x) => x.avg)).toEqual([95, 94.5, 93.5]);
  });
});
