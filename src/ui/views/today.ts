// „Šiandien“: savaitės juosta, suvestinė su žiedu, valgių kortelės.
import { countEntries, t } from '../../i18n';
import { baseline, bmr, dayLimit, MEALS, mealKcal, mealLabel, mealOf, stepsKcal } from '../../lib/calc';
import { addDays, dstr, parseD, today } from '../../lib/dates';
import { cap, esc, fmtDate, fmtWeekday, nf, nf1, newId } from '../../lib/format';
import type { FoodItem, MealKey, Product, SavedMeal } from '../../types';
import { toast } from '../dom';
import type { AppState } from '../state';
import { openAdd } from './add';
import { openEdit, openEditSteps, openEditWorkout } from './edit';
import { openWeight, weightCardHtml } from './weight';

/** Pirmadienis savaitės, kurioje yra data. */
export function weekStart(d: string) { const x = parseD(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return dstr(x); }

function ring(eaten: number, limit: number) {
  const r = 52, c = 2 * Math.PI * r, p = limit > 0 ? Math.min(1, eaten / limit) : 0, over = eaten > limit;
  const left = limit - eaten;
  return '<svg class="ring" viewBox="0 0 128 128" role="img" aria-label="' + esc(nf(Math.abs(left)) + ' kcal ' + t(over ? 'kcalOver' : 'kcalLeft')) + '">'
    + '<circle cx="64" cy="64" r="' + r + '" class="ring-track"/>'
    + (p > 0 ? '<circle cx="64" cy="64" r="' + r + '" class="ring-val' + (over ? ' over' : '') + '" stroke-dasharray="' + (c * p).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 64 64)"/>' : '')
    + '<text x="64" y="62" class="ring-num">' + nf(Math.abs(left)) + '</text>'
    + '<text x="64" y="82" class="ring-lbl">' + esc(t(over ? 'kcalOver' : 'kcalLeft')) + '</text></svg>';
}

function bar(label: string, val: number, goal: number | null, cls: string) {
  const pct = goal ? Math.min(100, val / goal * 100) : 0;
  return '<div class="macro ' + cls + '"><div class="macro-row"><span>' + esc(label) + '</span><b class="num">' + nf(val) + (goal ? ' / ' + nf(goal) : '') + ' g</b></div>'
    + (goal ? '<div class="bar"><i style="width:' + pct + '%"></i></div>' : '') + '</div>';
}

export function renderToday(s: AppState, root: HTMLElement) {
  const v = s.view, td = today(), g = s.settings, tt = s.totals(v), limit = dayLimit(g, tt.burned);
  const ws = weekStart(v);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const title = v === td ? t('today') : v === addDays(td, -1) ? t('yesterday') : cap(fmtDate(parseD(v)));
  const sub = v === td || v === addDays(td, -1) ? fmtDate(parseD(v)) : '';

  let h = '<header class="top"><div class="weekbar" role="group" aria-label="' + esc(t('pickDate')) + '">'
    + '<button type="button" class="iconbtn" data-week="-1" aria-label="' + esc(t('prevWeek')) + '">‹</button><div class="weekdays">';
  for (const d of days) {
    const fut = d > td, logged = (s.days[d]?.items.length ?? 0) > 0;
    h += '<button type="button" class="wday' + (d === v ? ' sel' : '') + (d === td ? ' is-today' : '') + '" data-day="' + d + '"' + (fut ? ' disabled' : '') + ' aria-pressed="' + (d === v) + '" aria-label="' + esc(fmtDate(parseD(d))) + '">'
      + '<span class="wd">' + esc(fmtWeekday(parseD(d))) + '</span><span class="dn num">' + parseD(d).getDate() + '</span><span class="dot' + (logged ? ' on' : '') + '"></span></button>';
  }
  h += '</div><button type="button" class="iconbtn" data-week="1" aria-label="' + esc(t('nextWeek')) + '"' + (addDays(ws, 7) > td ? ' disabled' : '') + '>›</button></div>'
    + '<div class="daytitle"><h1>' + esc(title) + '</h1>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + (v !== td ? '<button type="button" class="chipbtn" data-day="' + td + '">' + esc(t('today')) + '</button>' : '') + '</div></header>';

  // suvestinė
  h += '<section class="card summary" aria-label="' + esc(t('eaten')) + '">'
    + '<div class="sum-main">' + ring(tt.kcal, limit)
    + '<div class="sum-side"><div class="sum-of num">' + esc(t('kcalOf', { n: nf(limit) })) + '</div>'
    + '<div class="sum-pair num"><span>' + esc(t('eaten')) + ' <b>' + nf(tt.kcal) + '</b></span>' + (tt.burned ? '<span>' + esc(t('burned')) + ' <b class="ok">' + nf(tt.burned) + '</b></span>' : '') + '</div>'
    + bar(t('protein'), tt.protein, g.protein, 'prot') + '</div></div>'
    + '<div class="macros num"><span>' + esc(t('carbs')) + ' <b>' + nf(tt.carbs) + ' g</b></span><span>' + esc(t('fat')) + ' <b>' + nf(tt.fat) + ' g</b></span></div>';
  if (v !== td && tt.kcal > 0) {
    const out = baseline(g) + tt.burned, net = tt.kcal - out;
    h += '<div class="balance num"><span>' + esc(net <= 0 ? t('deficit') : t('surplus')) + '</span><b class="' + (net <= 0 ? 'def' : 'sur') + '">' + nf(Math.abs(net)) + ' kcal</b>'
      + '<small>' + esc(t('balanceHint', { base: nf(baseline(g)), bmr: nf(bmr(g)), extra: tt.burned ? t('balanceHintExtra', { n: nf(tt.burned) }) : '' })) + '</small></div>';
  }
  if (g.addBurned && tt.burned) h += '<p class="hint">' + esc(t('burnedAdded')) + '</p>';
  h += '</section>';
  h += weightCardHtml(s);

  // valgiai
  const food = s.day(v).items.slice().sort((a, b) => a.t - b.t);
  for (const [key] of MEALS) {
    const its = food.filter((i) => mealOf(i) === key);
    const k = mealKcal(its), pr = its.reduce((a, i) => a + (+i.protein || 0), 0);
    h += '<section class="card meal" data-meal="' + key + '"><div class="meal-head"><div><h2>' + esc(mealLabel(key)) + '</h2>'
      + '<span class="num">' + (its.length ? nf(k) + ' kcal · ' + esc(t('proteinShort', { n: nf(pr) })) : esc(t('emptyMeal'))) + '</span></div>'
      + '<button type="button" class="addbtn" data-add="' + key + '" aria-label="' + esc(t('addTo', { meal: mealLabel(key) })) + '">+</button></div>';
    if (its.length) {
      h += '<ul class="rows">' + its.map((it) => row(s, it)).join('') + '</ul>'
        + '<button type="button" class="linkbtn small" data-save-meal="' + key + '">☆ ' + esc(t('saveMeal')) + '</button>';
    }
    h += '</section>';
  }

  // sportas
  const ex = s.day(v).ex.slice().sort((a, b) => a.t - b.t), steps = s.day(v).steps;
  const burned = ex.reduce((a, w) => a + w.kcal, 0) + stepsKcal(steps, g.weight);
  h += '<section class="card meal sportcard"><div class="meal-head"><div><h2>' + esc(t('sport')) + '</h2><span class="num">' + (burned ? '−' + nf(burned) + ' kcal' : esc(t('emptyMeal'))) + '</span></div>'
    + '<button type="button" class="addbtn sport" data-add-sport aria-label="' + esc(t('addTo', { meal: t('sport') })) + '">+</button></div>';
  if (ex.length || steps) {
    h += '<ul class="rows">'
      + ex.map((w) => '<li><button type="button" class="row" data-wk="' + w.id + '"><span class="r-main"><span class="r-name">' + esc(w.name) + '</span><span class="r-sub">' + esc(w.amount) + '</span></span><span class="r-kcal ok num">−' + nf(w.kcal) + '</span></button></li>').join('')
      + (steps ? '<li><button type="button" class="row" data-steps><span class="r-main"><span class="r-name">' + esc(t('steps')) + '</span><span class="r-sub num">' + esc(t('stepsPerDay', { n: nf(steps) })) + '</span></span><span class="r-kcal ok num">−' + nf(stepsKcal(steps, g.weight)) + '</span></button></li>' : '')
      + '</ul>';
  }
  h += '</section>';
  const total = food.length + ex.length;
  h += '<p class="foot">' + (total ? esc(countEntries(total)) + ' · ' : '') + esc(t('foot')) + '</p>';
  root.innerHTML = h;
}

function row(s: AppState, it: FoodItem) {
  const p = it.maybe ? s.products.find((q) => q.id === it.maybe) : null;
  const u = +(it.units ?? 1) || 1;
  return '<li><button type="button" class="row" data-item="' + it.id + '"><span class="r-main"><span class="r-name">' + esc(it.name) + '</span>'
    + '<span class="r-sub num">' + esc(it.amount || '') + (it.amount ? ' · ' : '') + esc(t('proteinShort', { n: nf1(+it.protein || 0) })) + '</span></span>'
    + '<span class="r-kcal num">' + nf(+it.kcal || 0) + '</span></button>'
    + (p ? '<div class="maybe"><span>' + esc(t('maybeIs', { name: p.name })) + '</span><button type="button" class="chipbtn acc" data-mb-yes="' + it.id + '">' + esc(t('yes')) + ' · ' + nf(p.kcal * u) + ' kcal</button><button type="button" class="chipbtn" data-mb-no="' + it.id + '">' + esc(t('no')) + '</button></div>' : '')
    + '</li>';
}

/** „Gal tai …?“ – pakeitimas į Mano produktą. */
export function applyProduct(products: Product[], it: { maybe?: string | null; units?: number | null }) {
  const p = products.find((q) => q.id === it.maybe); if (!p) return null;
  const u = +(it.units ?? 1) || 1, r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    name: p.name, amount: nf1(u) + ' × ' + p.unit + (p.grams ? ' (' + nf(p.grams * u) + ' g)' : ''),
    kcal: Math.round(p.kcal * u), protein: r1((p.protein || 0) * u), carbs: r1((p.carbs || 0) * u), fat: r1((p.fat || 0) * u),
    maybe: null, units: null, productId: p.id,
  };
}

export function bindToday(s: AppState, root: HTMLElement) {
  // Savaitės keitimas perbraukiant juostą (telefone)
  let x0: number | null = null;
  root.addEventListener('touchstart', (e) => { x0 = (e.target as HTMLElement).closest('.weekbar') ? e.touches[0].clientX : null; }, { passive: true });
  root.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) < 50) return;
    const ws = weekStart(s.view), d = dx > 0 ? addDays(ws, -1) : addDays(ws, 7);
    s.goDay(d > today() ? today() : d);
  }, { passive: true });

  root.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const day = el.closest<HTMLElement>('[data-day]'); if (day) { s.goDay(day.dataset.day!); return; }
    const wk = el.closest<HTMLElement>('[data-week]');
    if (wk) { const n = +wk.dataset.week!; const d = addDays(weekStart(s.view), n * 7 + (n > 0 ? 0 : 6)); s.goDay(d > today() ? today() : d); return; }
    const add = el.closest<HTMLElement>('[data-add]'); if (add) { openAdd(s, { meal: add.dataset.add as MealKey, tab: 'food' }); return; }
    if (el.closest('[data-weight]')) { openWeight(s); return; }
    if (el.closest('[data-add-sport]')) { openAdd(s, { meal: s.defaultMeal(), tab: 'sport' }); return; }
    const yes = el.closest<HTMLElement>('[data-mb-yes]');
    if (yes) { const it = s.day(s.view).items.find((i) => i.id === yes.dataset.mbYes); const patch = it && applyProduct(s.products, it); if (patch) { s.updateFood(it!.id, patch); toast(t('added', { what: patch.name, kcal: nf(patch.kcal) })); } return; }
    const no = el.closest<HTMLElement>('[data-mb-no]'); if (no) { s.updateFood(no.dataset.mbNo!, { maybe: null, units: null }); return; }
    const item = el.closest<HTMLElement>('[data-item]'); if (item) { const it = s.day(s.view).items.find((i) => i.id === item.dataset.item); if (it) openEdit(s, it); return; }
    const w = el.closest<HTMLElement>('[data-wk]'); if (w) { const x = s.day(s.view).ex.find((i) => i.id === w.dataset.wk); if (x) openEditWorkout(s, x); return; }
    if (el.closest('[data-steps]')) { openEditSteps(s); return; }
    const sm = el.closest<HTMLElement>('[data-save-meal]'); if (sm) { saveMealPrompt(s, sm.dataset.saveMeal as MealKey, sm); return; }
  });
}

function saveMealPrompt(s: AppState, key: MealKey, btn: HTMLElement) {
  const card = btn.closest('.meal')!;
  if (card.querySelector('form.savemeal')) return;
  const f = document.createElement('form');
  f.className = 'savemeal';
  f.innerHTML = '<input type="text" name="nm" maxlength="40" aria-label="' + esc(t('saveMealName')) + '" value="' + esc(mealLabel(key)) + '"><button type="submit" class="btn main">' + esc(t('save')) + '</button><button type="button" class="btn" data-cancel>' + esc(t('cancel')) + '</button>';
  btn.replaceWith(f);
  const input = f.querySelector('input')!; input.focus(); input.select();
  f.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-cancel]')) s.changed(); });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const nm = input.value.trim().slice(0, 40) || mealLabel(key);
    const items = s.day(s.view).items.filter((i) => mealOf(i) === key)
      .map((i) => ({ name: i.name, amount: i.amount || '', kcal: +i.kcal || 0, protein: +i.protein || 0, carbs: +i.carbs || 0, fat: +i.fat || 0 }));
    if (items.length) { const m: SavedMeal = { id: newId(), name: nm, items }; s.addMeal(m); toast(t('saved') + ': „' + nm + '“'); }
    else s.changed();
  });
}

