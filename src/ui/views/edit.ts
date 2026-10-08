// Įrašo, treniruotės ir žingsnių taisymo langai.
import { t } from '../../i18n';
import { MEALS, mealLabel, mealOf, stepsKcal } from '../../lib/calc';
import { today } from '../../lib/dates';
import { esc, newId, nf, r1 } from '../../lib/format';
import type { FoodItem, MealKey, Workout } from '../../types';
import { inp, toast } from '../dom';
import { closeSheet, openSheet } from '../sheet';
import type { AppState } from '../state';

const num = (v: string, min = 0) => { const n = parseFloat(v.replace(',', '.')); return isFinite(n) && n >= min ? n : NaN; };

export function openEdit(s: AppState, it: FoodItem) {
  const sh = openSheet(t('editEntry'));
  const meal = mealOf(it);
  sh.body.innerHTML = '<form class="grid2" id="editForm" autocomplete="off">'
    + '<label class="span2">' + esc(t('name')) + '<input type="text" name="name" maxlength="80" required value="' + esc(it.name) + '"></label>'
    + '<label class="span2">' + esc(t('amount')) + '<input type="text" name="amount" maxlength="60" value="' + esc(it.amount || '') + '"></label>'
    + '<label>kcal<input type="number" name="kcal" min="0" step="1" required inputmode="numeric" value="' + Math.round(it.kcal) + '"></label>'
    + '<label>' + esc(t('protein')) + ', g<input type="number" name="protein" min="0" step="0.1" inputmode="decimal" value="' + (+it.protein || 0) + '"></label>'
    + '<label>' + esc(t('carbs')) + ', g<input type="number" name="carbs" min="0" step="0.1" inputmode="decimal" value="' + (+it.carbs || 0) + '"></label>'
    + '<label>' + esc(t('fat')) + ', g<input type="number" name="fat" min="0" step="0.1" inputmode="decimal" value="' + (+it.fat || 0) + '"></label>'
    + '<label class="span2">' + esc(t('meal')) + '<select name="meal">' + MEALS.map(([k]) => '<option value="' + k + '"' + (k === meal ? ' selected' : '') + '>' + esc(mealLabel(k)) + '</option>').join('') + '</select></label>'
    + '<button type="submit" class="btn main span2">' + esc(t('save')) + '</button>'
    + (s.view !== today() ? '<button type="button" class="btn span2" data-copy>' + esc(t('copyToday')) + '</button>' : '')
    + '<button type="button" class="btn danger span2" data-delete>' + esc(t('delete')) + '</button></form>';
  const f = sh.body.querySelector<HTMLFormElement>('#editForm')!;
  const val = (n: string) => (f.elements.namedItem(n) as HTMLInputElement).value;
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const kcal = num(val('kcal'));
    if (!val('name').trim() || isNaN(kcal)) return;
    s.updateFood(it.id, {
      name: val('name').trim().slice(0, 80), amount: val('amount').trim().slice(0, 60), kcal: Math.round(kcal),
      protein: r1(num(val('protein')) || 0), carbs: r1(num(val('carbs')) || 0), fat: r1(num(val('fat')) || 0), meal: val('meal') as MealKey,
    });
    closeSheet();
  });
  f.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    if (el.closest('[data-delete]')) { closeSheet(); s.deleteFood(it.id); }
    if (el.closest('[data-copy]')) { s.addFood([{ ...it, id: newId(), t: Date.now(), maybe: null, units: null }], today()); closeSheet(); toast(t('copied')); }
  });
}

export function openEditWorkout(s: AppState, w: Workout) {
  const sh = openSheet(t('editWorkout'));
  sh.body.innerHTML = '<form class="grid2" id="wkForm" autocomplete="off">'
    + '<label class="span2">' + esc(t('name')) + '<input type="text" name="name" maxlength="80" required value="' + esc(w.name) + '"></label>'
    + '<label class="span2">kcal<input type="number" name="kcal" min="0" step="1" required inputmode="numeric" value="' + Math.round(w.kcal) + '"></label>'
    + '<button type="submit" class="btn main span2">' + esc(t('save')) + '</button>'
    + '<button type="button" class="btn danger span2" data-delete>' + esc(t('delete')) + '</button></form>';
  const f = sh.body.querySelector<HTMLFormElement>('#wkForm')!;
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const k = num((f.elements.namedItem('kcal') as HTMLInputElement).value), name = (f.elements.namedItem('name') as HTMLInputElement).value.trim();
    if (!name || isNaN(k)) return;
    s.updateWorkout(w.id, { name: name.slice(0, 80), kcal: Math.round(k) });
    closeSheet();
  });
  f.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-delete]')) { closeSheet(); s.deleteWorkout(w.id); } });
}

export function openEditSteps(s: AppState) {
  const sh = openSheet(t('editSteps'));
  const cur = s.day(s.view).steps;
  sh.body.innerHTML = '<form class="grid2" id="stForm" autocomplete="off">'
    + '<label class="span2">' + esc(t('stepsLabel')) + '<input type="number" id="stVal" min="0" max="100000" inputmode="numeric" value="' + cur + '"></label>'
    + '<p class="hint span2 num" id="stKcal"></p>'
    + '<button type="submit" class="btn main span2">' + esc(t('save')) + '</button>'
    + '<button type="button" class="btn danger span2" data-delete>' + esc(t('delete')) + '</button></form>';
  const f = sh.body.querySelector<HTMLFormElement>('#stForm')!, input = inp('#stVal', f);
  const upd = () => { const n = Math.round(num(input.value)) || 0; f.querySelector('#stKcal')!.textContent = '−' + nf(stepsKcal(n, s.settings.weight)) + ' kcal'; };
  input.addEventListener('input', upd); upd();
  f.addEventListener('submit', (e) => { e.preventDefault(); const n = Math.round(num(input.value)); if (isNaN(n) || n > 100000) return; s.setSteps(n); closeSheet(); });
  f.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-delete]')) { closeSheet(); s.setSteps(0); } });
}
