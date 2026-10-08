import { describe, expect, it } from 'vitest';
import { baseline, bmr, dayStat, gramsPer, isMealPlan, mealOf, slotByHour, stepsKcal, suggestGoal, totals, verdict, workoutKcal, DEFAULT_SETTINGS } from '../src/lib/calc';
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
    date: '2026-10-07', steps: 8000,
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
