// Kopijavimas į kitą dieną: vienas įrašas, visas valgis arba visa diena.
import { countEntries, t } from '../../i18n';
import { MEALS, mealLabel } from '../../lib/calc';
import { addDays, parseD, today } from '../../lib/dates';
import { esc, fmtDate } from '../../lib/format';
import type { FoodItem, MealKey } from '../../types';
import { inp, toast } from '../dom';
import { closeSheet, openSheet } from '../sheet';
import type { AppState } from '../state';

/** `meal` – iš anksto pasirinktas valgis (vienam valgiui); be jo paliekami tie patys valgiai. */
export function openCopy(s: AppState, items: FoodItem[], meal?: MealKey) {
  if (!items.length) return;
  const sh = openSheet(t('copyTitle') + ': ' + (items.length === 1 ? items[0].name : countEntries(items.length)));
  // Dažniausiai kopijuojama iš praeities į šiandien; žiūrint šiandieną – siūlom šiandien (pvz. „dar kartą tą patį“).
  const def = today();
  sh.body.innerHTML = '<form class="grid2" id="copyForm" autocomplete="off">'
    + '<label class="span2">' + esc(t('copyDate')) + '<input type="date" id="cpDate" max="' + today() + '" value="' + def + '"></label>'
    + '<div class="chips span2">' + [0, -1].map((n) => '<button type="button" class="chipbtn" data-cp-day="' + addDays(today(), n) + '">' + esc(t(n === 0 ? 'today' : 'yesterday')) + '</button>').join('') + '</div>'
    + '<label class="span2">' + esc(t('copyMealSel')) + '<select id="cpMeal">'
    + (meal ? '' : '<option value="">' + esc(t('copyKeepMeal')) + '</option>')
    + MEALS.map(([k]) => '<option value="' + k + '"' + (k === meal ? ' selected' : '') + '>' + esc(mealLabel(k)) + '</option>').join('') + '</select></label>'
    + '<button type="submit" class="btn main span2">' + esc(t('copyMeal')) + '</button></form>';
  const f = sh.body.querySelector<HTMLFormElement>('#copyForm')!;
  f.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cp-day]');
    if (b) inp('#cpDate', f).value = b.dataset.cpDay!;
  });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = inp('#cpDate', f).value || def;
    if (d > today()) return;
    const m = (f.querySelector<HTMLSelectElement>('#cpMeal')!.value || undefined) as MealKey | undefined;
    s.copyFood(items, d, m);
    closeSheet();
    toast(t('copiedTo', { date: d === today() ? t('today').toLowerCase() : fmtDate(parseD(d)), what: countEntries(items.length) }));
  });
}
