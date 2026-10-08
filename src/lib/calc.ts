import { t, type Key } from '../i18n';
import type { Activity, Day, FoodItem, LookupResult, MealItem, MealKey, Product, Settings } from '../types';

export const DEFAULT_SETTINGS: Settings = {
  kcal: 2000, protein: 140, weight: 80, age: 35, height: 175, sex: 'm', addBurned: false, accurate: false,
  onboarded: false, lang: 'lt', activity: 'light', pace: 0.5, goalWeight: null,
  waterGoal: null, remindWater: false, remindMeals: false, remindFrom: 9, remindTo: 21, tz: 'Europe/Vilnius',
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

/* ---------- svoris ---------- */
/** Slankusis vidurkis: kiekvienai datai – paskutinių `days` dienų įrašų vidurkis. Įrašai surikiuoti pagal datą. */
export function weightTrend(entries: { date: string; kg: number }[], days = 7): { date: string; kg: number; avg: number }[] {
  const ms = (d: string) => Date.parse(d + 'T00:00:00Z');
  return entries.map((e, i) => {
    const from = ms(e.date) - (days - 1) * 864e5;
    const win = entries.slice(0, i + 1).filter((x) => ms(x.date) >= from);
    return { ...e, avg: Math.round(win.reduce((a, x) => a + x.kg, 0) / win.length * 10) / 10 };
  });
}

/* ---------- vanduo ---------- */
export const WATER_ML_PER_KG = 30;
export const WATER_ML_PER_SPORT_HOUR = 500;
const r250 = (x: number) => Math.round(x / 250) * 250;

/** Rekomenduojamas vanduo be sporto: ~30 ml kilogramui, 1,5–3,5 l. */
export function waterBase(s: Pick<Settings, 'weight' | 'waterGoal'>): number {
  if (s.waterGoal) return s.waterGoal;
  return Math.min(3500, Math.max(1500, r250(s.weight * WATER_ML_PER_KG)));
}
/** Dienos vandens tikslas: bazė + 0,5 l už sporto valandą. */
export function waterGoal(s: Pick<Settings, 'weight' | 'waterGoal'>, day?: Pick<Day, 'ex'>): number {
  const min = (day?.ex ?? []).reduce((a, w) => a + (w.minutes || 0), 0);
  return waterBase(s) + r250(min / 60 * WATER_ML_PER_SPORT_HOUR);
}
/** Kiek turėtų būti išgerta iki šios valandos (tolygiai tarp nuo ir iki). */
export function waterExpected(goal: number, hour: number, from: number, to: number): number {
  if (to <= from) return 0;
  const f = Math.min(1, Math.max(0, (hour - from) / (to - from)));
  return Math.round(goal * f / 50) * 50;
}

/* ---------- serija ---------- */
/** Kiek dienų iš eilės įrašytas maistas. Šiandiena įskaitoma, jei jau yra įrašų; jei ne – skaičiuojama nuo vakar. */
export function streak(days: Record<string, Pick<Day, 'items'> | undefined>, todayStr: string): number {
  const prev = (d: string) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };
  let d = (days[todayStr]?.items.length ?? 0) > 0 ? todayStr : prev(todayStr), n = 0;
  while ((days[d]?.items.length ?? 0) > 0) { n++; d = prev(d); }
  return n;
}

/* ---------- tikslo kalibravimas pagal svorį ---------- */
export const CALIB_DAYS = 28;
export const CALIB_MIN_DAYS = 14;
export const CALIB_MIN_WEIGHTS = 3;

export type Calibration =
  | { ok: false; loggedDays: number; weighIns: number; span: number }
  | { ok: true; tdee: number; formula: number; intake: number; perWeek: number; suggested: number; clamped: boolean; days: number; current: number };

/**
 * Tikrasis sudeginimas: vidutiniškai suvalgyta − svorio pokytis × 7700.
 * Imamos paskutinės 28 dienos (be šiandienos). Svorio pokytis – tiesinė regresija per svėrimus.
 * Dienos, kai suvalgyta mažiau nei pusė BMR, laikomos neužbaigtomis ir neįskaitomos.
 */
export function calibrate(days: Record<string, Day | undefined>, weights: { date: string; kg: number }[], s: Settings, todayStr: string): Calibration {
  const ms = (d: string) => Date.parse(d + 'T00:00:00Z');
  const t1 = ms(todayStr), t0 = t1 - CALIB_DAYS * 864e5;
  const ws = weights.filter((w) => ms(w.date) >= t0 && ms(w.date) <= t1);
  const first = ws[0] ? ms(ws[0].date) : t1;
  const minKcal = bmr(s) * 0.5;
  const dayKeys: string[] = [];
  for (let x = Math.max(t0, first); x < t1; x += 864e5) dayKeys.push(new Date(x).toISOString().slice(0, 10));
  const logged = dayKeys.map((d) => ({ d, tt: totals(days[d], s) })).filter((x) => x.tt.kcal >= minKcal);
  const span = ws.length ? Math.round((ms(ws[ws.length - 1].date) - first) / 864e5) : 0;
  if (logged.length < CALIB_MIN_DAYS || ws.length < CALIB_MIN_WEIGHTS || span < CALIB_MIN_DAYS || logged.length < dayKeys.length * 0.6) {
    return { ok: false, loggedDays: logged.length, weighIns: ws.length, span };
  }
  // tiesinė regresija: kg per dieną
  const xs = ws.map((w) => (ms(w.date) - first) / 864e5), ys = ws.map((w) => w.kg);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const intake = logged.reduce((a, x) => a + x.tt.kcal, 0) / logged.length;
  const burnedAvg = logged.reduce((a, x) => a + x.tt.burned, 0) / logged.length;
  const tdee = Math.round(intake - slope * KCAL_PER_KG_FAT);
  const formula = Math.round(bmr(s) * ACTIVITY[s.activity] + burnedAvg);
  // Jei sudegintos pridedamos prie limito, jų neįskaitom į tikslą antrą kartą.
  const raw = Math.round((tdee - (s.addBurned ? burnedAvg : 0) - s.pace * KCAL_PER_KG_FAT / 7) / 50) * 50;
  const min = MIN_KCAL[s.sex];
  return { ok: true, tdee, formula, intake: Math.round(intake), perWeek: Math.round(slope * 7 * 100) / 100, suggested: Math.max(min, Math.min(6000, raw)), clamped: raw < min, days: logged.length, current: s.kcal };
}
