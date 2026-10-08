import { t, type Key } from '../i18n';
import type { Activity, Day, FoodItem, LookupResult, MealItem, MealKey, Product, Settings } from '../types';

export const DEFAULT_SETTINGS: Settings = {
  kcal: 2000, protein: 140, weight: 80, age: 35, height: 175, sex: 'm', addBurned: false, accurate: false,
  onboarded: false, lang: 'lt', activity: 'light', pace: 0.5,
};

export const WORKOUT_MET = 4.5;
export const WALK_MET = 3.5;
export const STEPS_PER_MIN = 100;
export const KCAL_PER_KG_FAT = 7700;

/** Bazinė apykaita (Mifflin-St Jeor). */
export function bmr(s: Settings): number {
  return Math.round(10 * s.weight + 6.25 * s.height - 5 * s.age + (s.sex === 'f' ? -161 : 5));
}

/** Natūralus deginimas be judėjimo: BMR × 1,1 (kūnas + virškinimas). */
export function baseline(s: Settings): number {
  return Math.round(bmr(s) * 1.1);
}

/** Treniruotė: tik papildomos kcal virš ramybės, (MET − 1) × kg × val. */
export function workoutKcal(minutes: number, weight: number): number {
  return Math.round((WORKOUT_MET - 1) * weight * minutes / 60);
}

/** Žingsniai: (MET 3,5 − 1) × kg × (žingsniai / 100) / 60. */
export function stepsKcal(steps: number, weight: number): number {
  return Math.round((WALK_MET - 1) * weight * Math.max(0, steps) / STEPS_PER_MIN / 60);
}

export interface Totals { kcal: number; protein: number; carbs: number; fat: number; burned: number }

export function totals(day: Day | undefined, s: Settings): Totals {
  const t: Totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, burned: 0 };
  if (!day) return t;
  for (const it of day.items) { t.kcal += +it.kcal || 0; t.protein += +it.protein || 0; t.carbs += +it.carbs || 0; t.fat += +it.fat || 0; }
  for (const w of day.ex) t.burned += +w.kcal || 0;
  t.burned += stepsKcal(day.steps, s.weight);
  return t;
}

/** Dienos limitas (su sudegintomis, jei įjungta). */
export function dayLimit(s: Settings, burned: number): number {
  return s.kcal + (s.addBurned ? burned : 0);
}

/* ---------- valgiai ---------- */
export const MEALS: [MealKey, Key][] = [
  ['pusryciai', 'mealBreakfast'], ['pietus', 'mealLunch'], ['vakariene', 'mealDinner'], ['uzkandis', 'mealSnack'],
];
export function slotByHour(h: number): MealKey {
  return h < 11 ? 'pusryciai' : h < 16 ? 'pietus' : h < 21 ? 'vakariene' : 'uzkandis';
}
export function mealOf(it: Pick<FoodItem, 'meal' | 't'>): MealKey {
  if (it.meal && MEALS.some((m) => m[0] === it.meal)) return it.meal;
  return slotByHour(it.t ? new Date(it.t).getHours() : 12);
}
export function mealLabel(k: MealKey): string {
  const m = MEALS.find((x) => x[0] === k);
  return m ? t(m[1]) : '';
}
export function mealKcal(items: Pick<MealItem, 'kcal'>[]): number {
  return items.reduce((a, i) => a + (+i.kcal || 0), 0);
}

/** Ar skaičiuoklės tekstas yra keli produktai (valgio planas)? Kablelis ne tarp skaitmenų, ;, +, nauja eilutė, „ir“. */
export function isMealPlan(text: string): boolean {
  return /,(?!\d)|(?<!\d),|[;+\n]|\sir\s/i.test(text);
}

/* ---------- produktai ---------- */
export function gramsPer(p: Product): number {
  if (p.grams > 0) return +p.grams;
  const m = /^(\d+(?:[.,]\d+)?)\s*(g|ml)$/i.exec((p.unit || '').trim());
  return m ? parseFloat(m[1].replace(',', '.')) : 0;
}
export function isGramUnit(p: Product): boolean {
  return /^\d+(?:[.,]\d+)?\s*(g|ml)$/i.test((p.unit || '').trim());
}

/* ---------- skaičiuoklė ---------- */
export function pPer100kcal(r: Pick<LookupResult, 'per100'>): number {
  return r.per100.kcal > 0 ? r.per100.protein / r.per100.kcal * 100 : 0;
}
export function verdict(r: Pick<LookupResult, 'per100'>): ['ok' | 'over' | 'neutral', Key] {
  const p = r.per100, d = pPer100kcal(r);
  if (p.kcal > 0 && d >= 10) return ['ok', 'vHighProtein'];
  if (p.sugar >= 20) return ['over', 'vHighSugar'];
  if (p.kcal >= 400) return ['over', 'vHighKcal'];
  if (p.kcal <= 60) return ['ok', 'vLowKcal'];
  return ['neutral', 'vNeutral'];
}

/* ---------- tikslo skaičiavimas (vedlys ir Profilis) ---------- */
/** Kasdienio judėjimo koeficientai (be treniruočių – jos skaičiuojamos atskirai). */
export const ACTIVITY: Record<Activity, number> = { low: 1.2, light: 1.35, mid: 1.5 };
export const MIN_KCAL: Record<'m' | 'f', number> = { m: 1500, f: 1200 };

/**
 * Pasiūlytas dienos tikslas: BMR × judėjimas − tempas × 7700 / 7.
 * Baltymai – 1,6 g/kg, suapvalinta iki 5 g.
 */
export function suggestGoal(s: Pick<Settings, 'weight' | 'height' | 'age' | 'sex' | 'activity' | 'pace'>) {
  const tdee = bmr({ ...DEFAULT_SETTINGS, ...s }) * ACTIVITY[s.activity];
  const raw = Math.round((tdee - s.pace * KCAL_PER_KG_FAT / 7) / 50) * 50;
  const min = MIN_KCAL[s.sex];
  return { kcal: Math.max(min, raw), protein: Math.round(1.6 * s.weight / 5) * 5, clamped: raw < min, min };
}

/* ---------- statistika ---------- */
export interface DayStat {
  d: string; kcal: number; protein: number; burned: number; out: number; bal: number; steps: number; workouts: number; logged: boolean;
}
export function dayStat(date: string, day: Day | undefined, s: Settings): DayStat {
  const t = totals(day, s), out = baseline(s) + t.burned;
  return { d: date, kcal: t.kcal, protein: t.protein, burned: t.burned, out, bal: t.kcal - out, steps: day?.steps ?? 0, workouts: day?.ex.length ?? 0, logged: t.kcal > 0 };
}
