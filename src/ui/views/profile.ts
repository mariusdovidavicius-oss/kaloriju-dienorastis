// „Profilis“: tikslai, kalba, Mano produktai, dažni valgiai, paskyra.
import { LANGS, lang, setLang, t, type Lang } from '../../i18n';
import { mealKcal, suggestGoal, waterBase } from '../../lib/calc';
import { currentPush, disablePush, enablePush, isIos, isStandalone, pushSupported } from '../../lib/push';
import { esc, newId, nf, nf1, r1 } from '../../lib/format';
import type { Activity, Product, Settings } from '../../types';
import { inp, maybe, toast } from '../dom';
import { openRecipe } from './recipe';
import type { AppState } from '../state';

export interface ProfileCtx { anonymous: boolean; mock: boolean; onLogout: () => void; onSaveAccount: () => void }

export function renderProfile(s: AppState, root: HTMLElement, ctx: ProfileCtx) {
  const g = s.settings;
  const num = (id: string, label: string, val: number, min: number, max: number, step = 1) =>
    '<label>' + esc(label) + '<input type="number" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" inputmode="decimal" value="' + val + '"></label>';
  let h = '<header class="top"><div class="daytitle"><h1>' + esc(t('navProfile')) + '</h1></div></header>';

  h += '<section class="card"><h2>' + esc(t('goals')) + '</h2><form class="grid2" id="goalForm" autocomplete="off">'
    + num('gKcal', t('kcalGoal'), g.kcal, 800, 6000, 50) + num('gProt', t('proteinGoal'), g.protein, 20, 400, 5)
    + num('gWeight', t('weightKg'), g.weight, 30, 300, 0.1) + num('gAge', t('age'), g.age, 14, 100)
    + num('gHeight', t('heightCm'), g.height, 120, 230)
    + '<label>' + esc(t('goalWeightKg')) + '<input type="number" id="gGoalW" min="30" max="300" step="0.1" inputmode="decimal" value="' + (g.goalWeight ?? '') + '"></label>'
    + '<label>' + esc(t('sex')) + '<select id="gSex"><option value="m"' + (g.sex === 'm' ? ' selected' : '') + '>' + esc(t('male')) + '</option><option value="f"' + (g.sex === 'f' ? ' selected' : '') + '>' + esc(t('female')) + '</option></select></label>'
    + '<label class="span2">' + esc(t('obActivity')) + '<select id="gAct">' + (['low', 'light', 'mid'] as Activity[]).map((a) => '<option value="' + a + '"' + (g.activity === a ? ' selected' : '') + '>' + esc(t(a === 'low' ? 'actLow' : a === 'light' ? 'actLight' : 'actMid')) + '</option>').join('') + '</select></label>'
    + '<label class="span2">' + esc(t('obPace')) + '<select id="gPace">' + [[0, 'paceKeep'], [0.25, 'paceSlow'], [0.5, 'paceMid'], [0.75, 'paceFast']].map(([v, k]) => '<option value="' + v + '"' + (g.pace === v ? ' selected' : '') + '>' + esc(t(k as 'paceKeep')) + '</option>').join('') + '</select></label>'
    + '<button type="button" class="btn span2" id="recalc">' + esc(t('recalc')) + '</button>'
    + '<label class="check span2"><input type="checkbox" id="gBurned"' + (g.addBurned ? ' checked' : '') + '>' + esc(t('addBurned')) + '</label>'
    + '<label class="check span2"><input type="checkbox" id="gAcc"' + (g.accurate ? ' checked' : '') + '>' + esc(t('accurate')) + '</label>'
    + '<button type="submit" class="btn main span2">' + esc(t('save')) + '</button></form></section>';

  // vanduo ir priminimai
  const hours = (from: number, to: number, sel: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i).map((x) => '<option value="' + x + '"' + (x === sel ? ' selected' : '') + '>' + String(x).padStart(2, '0') + ':00</option>').join('');
  h += '<section class="card"><h2>' + esc(t('waterReminders')) + '</h2><form class="grid2" id="remForm" autocomplete="off">'
    + '<label class="span2">' + esc(t('waterGoalLabel')) + '<input type="number" id="wGoal" min="500" max="8000" step="250" inputmode="numeric" placeholder="' + esc(t('waterAutoPh', { n: nf(waterBase({ ...g, waterGoal: null })) })) + '" value="' + (g.waterGoal ?? '') + '"></label>'
    + '<p class="hint span2">' + esc(t('waterHint')) + '</p>'
    + '<label class="check span2"><input type="checkbox" id="rWater"' + (g.remindWater ? ' checked' : '') + '>' + esc(t('remindWater')) + '</label>'
    + '<label class="check span2"><input type="checkbox" id="rMeals"' + (g.remindMeals ? ' checked' : '') + '>' + esc(t('remindMeals')) + '</label>'
    + '<label>' + esc(t('remindFrom')) + '<select id="rFrom">' + hours(5, 14, g.remindFrom) + '</select></label>'
    + '<label>' + esc(t('remindTo')) + '<select id="rTo">' + hours(15, 24, g.remindTo) + '</select></label>'
    + '<p class="hint span2">' + esc(t('remindHint')) + '</p>'
    + '<div class="span2" id="pushBox"></div>'
    + '<button type="submit" class="btn main span2">' + esc(t('save')) + '</button></form></section>';

  // receptai
  const rs = s.recipes();
  h += '<section class="card"><h2>' + esc(t('recipes')) + '</h2>'
    + (rs.length ? '<ul class="plist">' + rs.map((r) => '<li><button type="button" class="linkbtn" data-edit-recipe="' + esc(r.id) + '">' + esc(r.name) + ' <small class="num">· ' + nf1(r.servings || 1) + ' ' + esc(t('portionsShort')) + ', ' + nf(mealKcal(r.items) / (r.servings || 1)) + ' kcal/' + esc(t('portionsShort')) + '</small></button><button type="button" class="iconbtn sm" data-del-meal="' + esc(r.id) + '" aria-label="' + esc(t('deleteRecipe')) + '">×</button></li>').join('') + '</ul>' : '<p class="hint">' + esc(t('recipesNone')) + '</p>')
    + '<button type="button" class="btn" id="newRecipe">' + esc(t('newRecipe')) + '</button><p class="hint">' + esc(t('recipeHint')) + '</p></section>';

  h += '<section class="card"><h2>' + esc(t('language')) + '</h2><div class="seg" role="group">'
    + LANGS.map((l) => '<button type="button" data-lang="' + l.code + '" aria-pressed="' + (lang() === l.code) + '">' + esc(l.label) + '</button>').join('') + '</div></section>';

  h += '<section class="card"><h2>' + esc(t('myProducts')) + '</h2><ul class="plist">'
    + s.products.map((p) => '<li><span>' + esc(p.name) + ' <small class="num">· ' + (/^\d/.test(p.unit) ? '' : '1 ') + esc(p.unit) + (p.grams ? ' (' + nf1(p.grams) + ' g)' : '') + ' = ' + nf1(p.kcal) + ' kcal, ' + nf1(p.protein || 0) + ' g</small></span><button type="button" class="iconbtn sm" data-del-prod="' + esc(p.id) + '" aria-label="' + esc(t('deleteProduct')) + '">×</button></li>').join('')
    + '</ul><form class="grid2" id="prodForm" autocomplete="off">'
    + '<input class="span2" type="text" id="pName" maxlength="80" required placeholder="' + esc(t('productNamePh')) + '" aria-label="' + esc(t('name')) + '">'
    + '<input class="span2" type="text" id="pUnit" maxlength="30" required placeholder="' + esc(t('unitPh')) + '" aria-label="' + esc(t('unitPh')) + '">'
    + '<input class="span2" type="number" id="pGrams" min="0" step="0.1" placeholder="' + esc(t('unitGramsPh')) + '" aria-label="' + esc(t('unitGramsPh')) + '" inputmode="decimal">'
    + '<input type="number" id="pKcal" min="0" step="0.1" required placeholder="' + esc(t('kcalPerUnitPh')) + '" aria-label="' + esc(t('kcalPerUnitPh')) + '" inputmode="decimal">'
    + '<input type="number" id="pProt" min="0" step="0.1" placeholder="' + esc(t('proteinPerUnitPh')) + '" aria-label="' + esc(t('proteinPerUnitPh')) + '" inputmode="decimal">'
    + '<button type="submit" class="btn span2">' + esc(t('addProduct')) + '</button></form><p class="hint">' + esc(t('productHint')) + '</p></section>';

  const ms = s.savedMeals();
  if (ms.length) h += '<section class="card"><h2>' + esc(t('frequentMeals')) + '</h2><ul class="plist">'
    + ms.map((m) => '<li><span>' + esc(m.name) + ' <small class="num">· ' + m.items.map((i) => esc(i.name)).join(', ') + ' = ' + nf(m.items.reduce((a, i) => a + i.kcal, 0)) + ' kcal</small></span><button type="button" class="iconbtn sm" data-del-meal="' + esc(m.id) + '" aria-label="' + esc(t('deleteMeal')) + '">×</button></li>').join('')
    + '</ul></section>';

  if (!ctx.mock) h += '<section class="card"><h2>' + esc(t('account')) + '</h2>'
    + (ctx.anonymous ? '<p class="hint">' + esc(t('anonInfo')) + '</p><button type="button" class="btn main" id="saveAcct">' + esc(t('saveAccount')) + '</button>' : '<button type="button" class="btn" id="logout">' + esc(t('logout')) + '</button>')
    + '</section>';
  root.innerHTML = h;
  void renderPush(root, ctx);
}

/** Pranešimų būsena šiame įrenginyje. */
async function renderPush(root: HTMLElement, ctx: ProfileCtx) {
  const box = maybe('#pushBox', root); if (!box) return;
  let html: string;
  if (ctx.mock) html = '<button type="button" class="btn" id="pushOn">' + esc(t('pushEnable')) + '</button>';
  else if (isIos() && !isStandalone()) html = '<p class="hint">' + esc(t('pushIos')) + '</p>';
  else if (!pushSupported()) html = '<p class="hint">' + esc(t('pushUnsupported')) + '</p>';
  else if (Notification.permission === 'denied') html = '<p class="hint">' + esc(t('pushDenied')) + '</p>';
  else {
    const sub = await currentPush();
    html = sub ? '<p class="status ok">' + esc(t('pushOn')) + '</p><button type="button" class="btn" id="pushOff">' + esc(t('pushDisable')) + '</button>'
      : '<button type="button" class="btn" id="pushOn">' + esc(t('pushEnable')) + '</button>';
  }
  box.innerHTML = html;
}

export function bindProfile(s: AppState, root: HTMLElement, ctx: ProfileCtx) {
  const read = (): Settings | null => {
    const v = (id: string) => parseFloat(inp('#' + id, root).value.replace(',', '.'));
    const k = Math.round(v('gKcal')), p = Math.round(v('gProt')), w = r1(v('gWeight')), a = Math.round(v('gAge')), h = Math.round(v('gHeight'));
    if (!(k >= 800 && k <= 6000) || !(p >= 20 && p <= 400) || !(w >= 30 && w <= 300) || !(a >= 14 && a <= 100) || !(h >= 120 && h <= 230)) return null;
    const gwRaw = inp('#gGoalW', root).value.trim(), gw = gwRaw ? r1(v('gGoalW')) : null;
    if (gw != null && !(gw >= 30 && gw <= 300)) return null;
    return {
      ...s.settings, kcal: k, protein: p, weight: w, age: a, height: h,
      sex: (root.querySelector<HTMLSelectElement>('#gSex')!.value === 'f' ? 'f' : 'm'),
      activity: root.querySelector<HTMLSelectElement>('#gAct')!.value as Activity,
      pace: parseFloat(root.querySelector<HTMLSelectElement>('#gPace')!.value) || 0,
      addBurned: inp('#gBurned', root).checked, accurate: inp('#gAcc', root).checked,
      goalWeight: gw,
    };
  };
  root.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    if (el.id === 'recalc') {
      const cur = read(); if (!cur) { toast(t('obInvalid')); return; }
      const r = suggestGoal(cur);
      inp('#gKcal', root).value = String(r.kcal); inp('#gProt', root).value = String(r.protein);
      if (r.clamped) toast(t('obMinWarn', { n: nf(r.min) }));
      return;
    }
    const lb = el.closest<HTMLElement>('[data-lang]');
    if (lb) { const l = lb.dataset.lang as Lang; setLang(l); s.saveSettings({ ...s.settings, lang: l }); return; }
    const dp = el.closest<HTMLElement>('[data-del-prod]'); if (dp) { s.deleteProduct(dp.dataset.delProd!); return; }
    const dm = el.closest<HTMLElement>('[data-del-meal]'); if (dm) { s.deleteMeal(dm.dataset.delMeal!); return; }
    if (el.id === 'saveAcct') { ctx.onSaveAccount(); return; }
    if (el.id === 'newRecipe') { openRecipe(s, null); return; }
    const er = el.closest<HTMLElement>('[data-edit-recipe]'); if (er) { const r = s.meals.find((m) => m.id === er.dataset.editRecipe); if (r) openRecipe(s, r); return; }
    if (el.id === 'pushOn') {
      if (ctx.mock) { toast(t('pushMock')); return; }
      (el as HTMLButtonElement).disabled = true;
      enablePush(s.store).then(() => toast(t('pushOn')))
        .catch((e) => toast(t(e?.code === 'denied' ? 'pushDenied' : e?.code === 'unsupported' ? 'pushUnsupported' : 'pushFailed')))
        .finally(() => void renderPush(root, ctx));
      return;
    }
    if (el.id === 'pushOff') { void disablePush(s.store).finally(() => void renderPush(root, ctx)); return; }
    if (el.id === 'logout') ctx.onLogout();
  });
  root.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    if (f.id === 'goalForm') {
      const ns = read(); if (!ns) { toast(t('obInvalid')); return; }
      const accChanged = ns.accurate !== s.settings.accurate;
      s.saveSettings(ns);
      toast(accChanged ? t(ns.accurate ? 'accurateOn' : 'accurateOff') : t('goalsSaved'));
    }
    if (f.id === 'remForm') {
      const wRaw = inp('#wGoal', root).value.trim(), wg = wRaw ? Math.round(parseFloat(wRaw)) : null;
      if (wg != null && !(wg >= 500 && wg <= 8000)) { toast(t('obInvalid')); return; }
      const from = +root.querySelector<HTMLSelectElement>('#rFrom')!.value, to = +root.querySelector<HTMLSelectElement>('#rTo')!.value;
      let tz = s.settings.tz; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch { /* nesvarbu */ }
      const ns: Settings = { ...s.settings, waterGoal: wg, remindWater: inp('#rWater', root).checked, remindMeals: inp('#rMeals', root).checked, remindFrom: from, remindTo: to, tz };
      s.saveSettings(ns);
      if ((ns.remindWater || ns.remindMeals) && !ctx.mock) void currentPush().then((p) => toast(p ? t('remindSaved') : t('pushNeeded')));
      else toast(t('remindSaved'));
      return;
    }
    if (f.id === 'prodForm') {
      if (s.products.length >= 100) { toast(t('productLimit')); return; }
      const name = inp('#pName', root).value.trim(), unit = inp('#pUnit', root).value.trim(), k = parseFloat(inp('#pKcal', root).value);
      if (!name || !unit || !(k >= 0)) return;
      const g = parseFloat(inp('#pGrams', root).value), pr = parseFloat(inp('#pProt', root).value);
      const p: Product = { id: newId(), name: name.slice(0, 80), unit: unit.slice(0, 30), grams: g > 0 ? r1(g) : 0, kcal: r1(k), protein: pr > 0 ? r1(pr) : 0, carbs: 0, fat: 0 };
      s.addProduct(p);
      toast(t('productAdded', { name: p.name }));
    }
  });
}
