import { describe, expect, it } from 'vitest';
import { baseline, bmr, calibrate, dayStat, streak, waterBase, waterExpected, waterGoal, gramsPer, isMealPlan, mealOf, slotByHour, stepsKcal, suggestGoal, totals, verdict, workoutKcal, DEFAULT_SETTINGS } from '../src/lib/calc';
import { addDays, periodDays } from '../src/lib/dates';
import { countEntries, setLang, t } from '../src/i18n';
import { en } from '../src/i18n/en';
import { lt } from '../src/i18n/lt';
import type { Day } from '../src/types';

const S = { ...DEFAULT_SETTINGS, weight: 94, height: 183, age: 36, sex: 'm' as const };

describe('formulės (sutampa su projekto aprašu)', () => {
  it('BMR ~1910 ir natūralus deginimas ~2100', () => {
    expect(bmr(S)).toBe(1909);
    expect(baseline(S)).toBe(2100);
  });
  it('moters BMR mažesnis 166 kcal', () => {
    expect(bmr(S) - bmr({ ...S, sex: 'f' })).toBe(166);
  });
  it('40 min treniruotė ≈ 219 kcal', () => expect(workoutKcal(40, 94)).toBe(219));
  it('8000 žingsnių ≈ 313 kcal', () => expect(stepsKcal(8000, 94)).toBe(313));
  it('neigiami žingsniai = 0', () => expect(stepsKcal(-5, 94)).toBe(0));
});

describe('dienos sumos', () => {
  const day: Day = {
    date: '2026-10-07', steps: 8000, water: 0,
    items: [
      { id: '1', name: 'A', amount: '', kcal: 500, protein: 40, carbs: 30, fat: 10, t: 0, meal: 'pietus' },
      { id: '2', name: 'B', amount: '', kcal: 300, protein: 20, carbs: 10, fat: 5, t: 0, meal: 'vakariene' },
    ],
    ex: [{ id: 'w', name: 'Treniruotė', amount: '40 min', kcal: 219, t: 0 }],
  };
  it('sumuoja maistą ir sudegintas', () => {
    const t = totals(day, S);
    expect(t).toMatchObject({ kcal: 800, protein: 60, carbs: 40, fat: 15, burned: 219 + 313 });
  });
  it('balansas = suvalgyta − (natūralus + sportas)', () => {
    const s = dayStat(day.date, day, S);
    expect(s.out).toBe(2100 + 532);
    expect(s.bal).toBe(800 - 2632);
    expect(s.logged).toBe(true);
  });
  it('tuščia diena', () => expect(dayStat('2026-10-01', undefined, S).logged).toBe(false));
});

describe('valgiai', () => {
  it('laikas → valgis', () => {
    expect(slotByHour(8)).toBe('pusryciai');
    expect(slotByHour(13)).toBe('pietus');
    expect(slotByHour(19)).toBe('vakariene');
    expect(slotByHour(23)).toBe('uzkandis');
  });
  it('mealOf naudoja įrašytą valgį', () => {
    expect(mealOf({ meal: 'uzkandis', t: new Date(2026, 9, 7, 8).getTime() })).toBe('uzkandis');
  });
});

describe('skaičiuoklė', () => {
  it('valgio plano atpažinimas', () => {
    expect(isMealPlan('5 kiaušiniai, 3 riekės duonos')).toBe(true);
    expect(isMealPlan('kiaušinis ir duona')).toBe(true);
    expect(isMealPlan('jogurtas 3,9 %')).toBe(false);
    expect(isMealPlan('graikiškas jogurtas')).toBe(false);
  });
  it('verdiktas', () => {
    expect(verdict({ per100: { kcal: 73, protein: 9, carbs: 4, sugar: 4, fat: 2 } })[1]).toBe('vHighProtein');
    expect(verdict({ per100: { kcal: 500, protein: 5, carbs: 60, sugar: 40, fat: 25 } })[1]).toBe('vHighSugar');
  });
  it('vieneto svoris iš „100 g“', () => {
    expect(gramsPer({ id: '', name: '', unit: '100 g', grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0 })).toBe(100);
    expect(gramsPer({ id: '', name: '', unit: 'riekė', grams: 33, kcal: 0, protein: 0, carbs: 0, fat: 0 })).toBe(33);
  });
});

describe('tikslo pasiūlymas', () => {
  it('Marius: sėdimas darbas, −0,5 kg/sav. ≈ 1 750 kcal, 150 g baltymų', () => {
    const r = suggestGoal({ ...S, activity: 'low', pace: 0.5 });
    expect(r.kcal).toBe(1750);
    expect(r.protein).toBe(150);
  });
  it('neleidžia nukristi žemiau minimumo', () => {
    const r = suggestGoal({ weight: 50, height: 155, age: 60, sex: 'f', activity: 'low', pace: 0.75 });
    expect(r.kcal).toBe(1200);
    expect(r.clamped).toBe(true);
  });
  it('išlaikymas = BMR × judėjimas', () => {
    expect(suggestGoal({ ...S, activity: 'mid', pace: 0 }).kcal).toBe(Math.round(1909 * 1.5 / 50) * 50);
  });
});

describe('datos ir tekstai', () => {
  it('addDays per mėnesio ribą', () => expect(addDays('2026-10-01', -1)).toBe('2026-09-30'));
  it('periodDays', () => expect(periodDays(3, '2026-10-07')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']));
  it('lietuviškos galūnės', () => {
    setLang('lt');
    expect(countEntries(1)).toBe('1 įrašas');
    expect(countEntries(3)).toBe('3 įrašai');
    expect(countEntries(11)).toBe('11 įrašų');
    expect(countEntries(21)).toBe('21 įrašas');
  });
  it('angliški tekstai', () => {
    setLang('en');
    expect(countEntries(1)).toBe('1 entry');
    expect(countEntries(5)).toBe('5 entries');
    expect(t('kcalOf', { n: '2,000' })).toBe('of 2,000 kcal');
    setLang('lt');
  });
  it('abiejose kalbose tie patys raktai, be tuščių tekstų', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(lt).sort());
    for (const v of [...Object.values(en), ...Object.values(lt)]) expect(v.trim().length).toBeGreaterThan(0);
  });
  it('{kintamieji} sutampa abiejose kalbose', () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) || []).sort().join(',');
    for (const k of Object.keys(lt) as (keyof typeof lt)[]) expect(vars(en[k]), k).toBe(vars(lt[k]));
  });
});

describe('vanduo', () => {
  const s = { ...DEFAULT_SETTINGS, weight: 94 };
  it('30 ml/kg, suapvalinta iki 250 ml', () => expect(waterBase(s)).toBe(2750));
  it('ribos 1,5–3,5 l', () => { expect(waterBase({ ...s, weight: 40 })).toBe(1500); expect(waterBase({ ...s, weight: 150 })).toBe(3500); });
  it('rankinis tikslas', () => expect(waterBase({ ...s, waterGoal: 2000 })).toBe(2000));
  it('+0,5 l už sporto valandą', () => expect(waterGoal(s, { ex: [{ id: 'w', name: '', amount: '', minutes: 60, kcal: 0, t: 0 }] })).toBe(3250));
  it('planas pagal valandą', () => { expect(waterExpected(2400, 9, 9, 21)).toBe(0); expect(waterExpected(2400, 15, 9, 21)).toBe(1200); expect(waterExpected(2400, 23, 9, 21)).toBe(2400); });
});

describe('serija', () => {
  const d = (n: number) => ({ items: n ? [{}] : [] }) as unknown as Day;
  it('skaičiuoja iki šiandienos', () => expect(streak({ '2026-10-08': d(1), '2026-10-07': d(1), '2026-10-06': d(1), '2026-10-04': d(1) }, '2026-10-08')).toBe(3));
  it('šiandien dar tuščia – nuo vakar', () => expect(streak({ '2026-10-07': d(1), '2026-10-06': d(1) }, '2026-10-08')).toBe(2));
  it('per mėnesio ribą', () => expect(streak({ '2026-10-01': d(1), '2026-09-30': d(1) }, '2026-10-01')).toBe(2));
  it('nėra įrašų', () => expect(streak({}, '2026-10-08')).toBe(0));
});

describe('kalibravimas pagal svorį', () => {
  const s = { ...DEFAULT_SETTINGS, weight: 94, height: 183, age: 36, sex: 'm' as const, activity: 'light' as const, pace: 0.5, kcal: 2000 };
  const td = '2026-10-29';
  const date = (i: number) => new Date(Date.parse(td + 'T00:00:00Z') - i * 864e5).toISOString().slice(0, 10);
  const days: Record<string, Day> = {};
  for (let i = 1; i <= 28; i++) days[date(i)] = { date: date(i), steps: 0, water: 0, ex: [], items: [{ id: 'x' + i, name: 'x', amount: '', kcal: 2000, protein: 0, carbs: 0, fat: 0, t: 0, meal: 'pietus' }] };
  // −0,1 kg per dieną = −770 kcal/d → sudegina 2770
  const weights = [28, 21, 14, 7, 0].map((i) => ({ date: date(i), kg: Math.round((96 - (28 - i) * 0.1) * 10) / 10 }));
  it('apskaičiuoja tikrąjį sudeginimą', () => {
    const c = calibrate(days, weights, s, td);
    expect(c.ok).toBe(true);
    if (c.ok) { expect(c.tdee).toBe(2770); expect(c.perWeek).toBe(-0.7); expect(c.suggested).toBe(2200); expect(c.intake).toBe(2000); }
  });
  it('per mažai duomenų', () => {
    const c = calibrate(days, weights.slice(-2), s, td);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.weighIns).toBe(2);
  });
  it('neužbaigtos dienos neįskaitomos', () => {
    const few: Record<string, Day> = {};
    for (let i = 1; i <= 28; i++) few[date(i)] = { ...days[date(i)], items: [{ ...days[date(i)].items[0], kcal: i % 2 ? 2000 : 300 }] };
    expect(calibrate(few, weights, s, td).ok).toBe(false);
  });
  it('minimumas moteriai', () => {
    const c = calibrate(days, weights.map((w, i) => ({ ...w, kg: 70 + i * 0.7 })), { ...s, sex: 'f', weight: 70 }, td);
    expect(c.ok && c.suggested).toBe(1200);
  });
});
