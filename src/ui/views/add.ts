// „Pridėti“ langas: Maistas (AI aprašymas, nuotrauka, Mano produktai, dažni, neseniai, rankinis),
// Sportas (treniruotė, žingsniai) ir Skaičiuoklė (produktas, valgio planas, palyginimas, lengvesni produktai).
import { t } from '../../i18n';
import { dayLimit, gramsPer, isGramUnit, isMealPlan, MEALS, mealKcal, mealLabel, mealOf, pPer100kcal, stepsKcal, verdict, workoutKcal } from '../../lib/calc';
import { addDays, parseD, today } from '../../lib/dates';
import { esc, fmtDate, newId, nf, nf1, r1 } from '../../lib/format';
import { prepareImage } from '../../lib/image';
import type { AlternativesResult, EstimatedItem, FoodItem, LookupResult, MealItem, MealKey } from '../../types';
import { inp, maybe, toast } from '../dom';
import { closeSheet, openSheet } from '../sheet';
import { aiErr, type AppState } from '../state';
import { applyProduct } from './today';

type AddTab = 'food' | 'sport' | 'calc';
interface CmpRow { id: string; name: string; unit: 'g' | 'ml'; per100: LookupResult['per100'] }
interface PlanItem extends EstimatedItem { key: string; productId?: string | null }

const CMP_KEY = 'kalorijos-cmp';
function loadCmp(): CmpRow[] { try { const v = JSON.parse(localStorage.getItem(CMP_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function saveCmp(rows: CmpRow[]) { try { localStorage.setItem(CMP_KEY, JSON.stringify(rows)); } catch { /* nesvarbu */ } }

export function openAdd(s: AppState, opts: { meal: MealKey; tab: AddTab }) {
  const st = {
    meal: opts.meal, tab: opts.tab, busy: false, file: null as File | null, mpSel: null as string | null,
    cbusy: false, cfile: null as File | null, cres: null as (LookupResult & { id: string }) | null, plan: null as PlanItem[] | null,
    cmp: loadCmp(), alt: null as AlternativesResult | null, altBusy: false,
  };
  const sheet = openSheet(t('addTo', { meal: mealLabel(st.meal) }), { id: 'addSheet' });
  const root = sheet.body;
  const status = (msg: string, err = false) => { const el = maybe('#addStatus', root); if (el) { el.textContent = msg; el.className = 'status' + (err ? ' err' : ''); } };
  const done = (msg: string) => { closeSheet(); toast(msg); };

  const toFood = (it: EstimatedItem | MealItem, extra: Partial<FoodItem> = {}): FoodItem => {
    const e = it as EstimatedItem;
    return {
      id: newId(), name: it.name, amount: it.amount || '', kcal: Math.round(+it.kcal || 0), protein: +it.protein || 0, carbs: +it.carbs || 0, fat: +it.fat || 0,
      t: Date.now(), meal: st.meal, maybe: e.maybe ?? null, units: e.units ?? null, source: 'ai', ...extra,
    };
  };

  /* ---------- piešimas ---------- */
  function render() {
    sheet.setTitle(st.tab === 'sport' ? t('sport') : st.tab === 'calc' ? t('tabCalc') : t('addTo', { meal: mealLabel(st.meal) }));
    let h = '<div class="seg" role="tablist">'
      + (['food', 'sport', 'calc'] as AddTab[]).map((k) => '<button type="button" role="tab" data-tab="' + k + '" aria-selected="' + (st.tab === k) + '">' + esc(t(k === 'food' ? 'tabFood' : k === 'sport' ? 'tabSport' : 'tabCalc')) + '</button>').join('')
      + '</div>';
    if (st.tab === 'food') h += foodHtml();
    else if (st.tab === 'sport') h += sportHtml();
    else h += calcHtml();
    h += '<div class="status" id="addStatus" role="status"></div>';
    root.innerHTML = h;
    if (st.tab === 'calc') { renderCalcOut(); renderCmp(); renderAlt(); }
    if (st.tab === 'food') renderQty();
  }

  function foodHtml() {
    const ps = s.products, ms = s.meals, v = s.view;
    const yd = s.day(addDays(v, -1)).items.filter((i) => mealOf(i) === st.meal);
    const mine = s.day(v).items.filter((i) => mealOf(i) === st.meal);
    const recent = s.recentFoods(10);
    return '<div class="slots" role="group" aria-label="' + esc(t('meal')) + '">' + MEALS.map(([k]) => '<button type="button" class="chipbtn' + (st.meal === k ? ' sel' : '') + '" data-slot="' + k + '" aria-pressed="' + (st.meal === k) + '">' + esc(mealLabel(k)) + '</button>').join('') + '</div>'
      + '<form class="describe" id="aiForm" autocomplete="off">'
      + '<textarea id="foodInput" rows="2" placeholder="' + esc(t('describePh')) + '" aria-label="' + esc(t('describePh')) + '"></textarea>'
      + '<div class="describe-row"><input type="number" id="foodGrams" placeholder="' + esc(t('gramsPh')) + '" aria-label="' + esc(t('gramsLabel')) + '" min="1" max="5000" inputmode="numeric">'
      + '<label class="btn photo"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>' + esc(t('photo')) + '<input type="file" id="photoInput" accept="image/*"></label>'
      + '<button type="submit" class="btn main" id="aiBtn"' + (st.busy ? ' disabled' : '') + '>' + esc(st.busy ? t('calculating') : t('calculate')) + '</button></div>'
      + (st.file ? '<span class="filechip"><span>' + esc(st.file.name || 'foto') + '</span><button type="button" data-clear-photo aria-label="' + esc(t('removePhoto')) + '">×</button></span>' : '')
      + '<p class="hint">' + esc(t('aiNote')) + '</p></form>'
      + '<h3>' + esc(t('myProducts')) + '</h3><div class="chips">' + (ps.length ? ps.map((p) => '<button type="button" class="chipbtn' + (st.mpSel === p.id ? ' sel' : '') + '" data-mp="' + esc(p.id) + '">' + esc(p.name) + '<small class="num">' + nf(p.kcal) + '/' + esc(p.unit) + '</small></button>').join('') : '<span class="hint">' + esc(t('noProducts')) + '</span>') + '</div>'
      + '<div id="mpQty"></div>'
      + '<h3>' + esc(t('frequentMeals')) + '</h3><div class="chips">'
      + (!mine.length && yd.length ? '<button type="button" class="chipbtn dashed" data-yday>' + esc(t('likeYesterday')) + '<small class="num">' + nf(mealKcal(yd)) + ' kcal</small></button>' : '')
      + (ms.length ? ms.map((m) => '<button type="button" class="chipbtn" data-ml="' + esc(m.id) + '">' + esc(m.name) + '<small class="num">' + nf(mealKcal(m.items)) + ' kcal</small></button>').join('') : (yd.length && !mine.length ? '' : '<span class="hint">' + esc(t('noMeals')) + '</span>'))
      + '</div>'
      + (recent.length ? '<h3>' + esc(t('recent')) + '</h3><div class="chips">' + recent.map((r, i) => '<button type="button" class="chipbtn" data-recent="' + i + '">' + esc(r.name) + '<small class="num">' + nf(r.kcal) + ' kcal</small></button>').join('') + '</div>' : '')
      + '<details class="manual"><summary>' + esc(t('manual')) + '</summary><form class="grid3" id="manForm" autocomplete="off">'
      + '<input type="text" id="manName" placeholder="' + esc(t('name')) + '" aria-label="' + esc(t('name')) + '" required maxlength="80">'
      + '<input type="number" id="manKcal" placeholder="kcal" aria-label="kcal" min="0" step="1" required inputmode="numeric">'
      + '<input type="number" id="manProt" placeholder="' + esc(t('protein')) + ', g" aria-label="' + esc(t('protein')) + ', g" min="0" step="0.1" inputmode="decimal">'
      + '<button type="submit" class="btn">' + esc(t('add')) + '</button></form></details>';
  }

  function sportHtml() {
    const steps = s.day(s.view).steps;
    return '<form class="grid2" id="sportForm" autocomplete="off">'
      + '<label>' + esc(t('sportMin')) + '<input type="number" id="sportMin" min="1" max="600" placeholder="' + esc(t('sportMinPh')) + '" inputmode="numeric"></label>'
      + '<label>' + esc(t('stepsLabel')) + '<input type="number" id="stepsIn" min="0" max="100000" placeholder="' + esc(t('stepsPh')) + '" inputmode="numeric" value="' + (steps || '') + '"></label>'
      + '<button type="submit" class="btn main sport span2">' + esc(t('save')) + '</button></form>'
      + '<p class="hint">' + esc(t('sportHint')) + '</p>';
  }

  function calcHtml() {
    return '<form class="describe" id="calcForm" autocomplete="off"><div class="describe-row">'
      + '<input type="text" id="calcName" class="grow" placeholder="' + esc(t('calcPh')) + '" aria-label="' + esc(t('calcPh')) + '">'
      + '<input type="number" id="calcGrams" placeholder="g" aria-label="' + esc(t('gramsLabel')) + '" min="1" max="5000" inputmode="numeric"></div>'
      + '<div class="describe-row"><label class="btn photo"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>' + esc(t('photoLabel')) + '<input type="file" id="calcPhoto" accept="image/*"></label>'
      + '<button type="submit" class="btn main grow" id="calcBtn"' + (st.cbusy ? ' disabled' : '') + '>' + esc(st.cbusy ? t('searching') : t('check')) + '</button></div>'
      + (st.cfile ? '<span class="filechip"><span>' + esc(st.cfile.name || 'foto') + '</span><button type="button" data-clear-cphoto aria-label="' + esc(t('removePhoto')) + '">×</button></span>' : '')
      + '<p class="hint">' + esc(t('calcHint')) + '</p></form>'
      + '<div id="calcOut"></div><div id="cmpOut"></div>'
      + '<div class="altbox"><h3>' + esc(t('findLighter')) + '</h3><form class="describe-row" id="altForm" autocomplete="off"><input type="text" id="altQ" class="grow" placeholder="' + esc(t('lighterPh')) + '" aria-label="' + esc(t('findLighter')) + '"><button type="submit" class="btn main" id="altBtn">' + esc(t('suggest')) + '</button></form><div id="altOut"></div></div>';
  }

  /* ---------- Mano produktai: kiekis ---------- */
  function renderQty() {
    const q = maybe('#mpQty', root); if (!q) return;
    const sel = s.products.find((p) => p.id === st.mpSel);
    if (!sel) { q.innerHTML = ''; return; }
    const gp = gramsPer(sel);
    q.innerHTML = '<div class="qty"><b>' + esc(sel.name) + '</b><div class="qty-row"><span class="stepper"><button type="button" data-step="-1" aria-label="−">−</button><input type="number" id="mpN" value="1" min="0.25" step="0.25" aria-label="' + esc(t('quantity')) + '" inputmode="decimal"><button type="button" data-step="1" aria-label="+">+</button></span><span>' + esc(sel.unit) + '</span>'
      + (gp ? '<span>' + esc(t('orGrams')) + '</span><input type="number" class="gin" id="mpG" min="1" max="5000" inputmode="numeric" aria-label="g" value="' + Math.round(gp) + '"><span>g</span>' : '') + '</div>'
      + '<div class="qty-row"><span class="tot num" id="mpTot"></span><button type="button" class="btn main" id="mpAdd">' + esc(t('add')) + '</button></div></div>';
    mpTot();
  }
  function mpTot() {
    const sel = s.products.find((p) => p.id === st.mpSel), n = parseFloat(maybe<HTMLInputElement>('#mpN', root)?.value || '') || 0, el = maybe('#mpTot', root);
    if (sel && el) el.textContent = '= ' + nf(sel.kcal * n) + ' kcal, ' + t('proteinShort', { n: nf1((sel.protein || 0) * n) });
  }

  /* ---------- skaičiuoklė ---------- */
  function renderCalcOut() {
    const out = maybe('#calcOut', root); if (!out) return;
    if (st.plan) { out.innerHTML = planHtml(); return; }
    const r = st.cres; if (!r) { out.innerHTML = ''; return; }
    const [cls, vk] = verdict(r), u = r.unit;
    out.innerHTML = '<div class="card res"><div class="res-head"><div><div class="res-name">' + esc(r.name) + '</div><div class="hint">' + esc(t('per100', { u })) + (r.portionDesc ? ' · ' + esc(t('portion', { desc: r.portionDesc, g: r.grams, u })) : '') + '</div></div><span class="pill ' + cls + '">' + esc(t(vk)) + '</span></div>'
      + '<div class="g4 num"><div><b>' + nf(r.per100.kcal) + '</b><span>kcal</span></div><div><b>' + nf1(r.per100.protein) + '</b><span>' + esc(t('protein')) + ', g</span></div><div><b>' + nf1(r.per100.carbs) + '</b><span>' + esc(t('carbs')) + ', g</span></div><div><b>' + nf1(r.per100.fat) + '</b><span>' + esc(t('fat')) + ', g</span></div></div>'
      + '<div class="qty-row num"><label for="calcG">' + esc(t('quantity')) + '</label><input type="number" id="calcG" class="gin" min="1" max="5000" value="' + r.grams + '" inputmode="numeric"> ' + u + ' = <b id="calcPortion"></b></div>'
      + '<p class="hint num" id="calcFit"></p>' + (r.tip ? '<p class="tip">' + esc(r.tip) + '</p>' : '')
      + '<div class="btns"><button type="button" class="btn main" id="calcAdd">' + esc(t('addToDiary')) + '</button><button type="button" class="btn" id="calcCmp">' + esc(t('toCompare')) + '</button></div></div>';
    updatePortion();
  }
  function updatePortion() {
    const r = st.cres, el = maybe('#calcPortion', root); if (!r || !el) return;
    const f = r.grams / 100;
    el.textContent = nf(r.per100.kcal * f) + ' kcal, ' + t('proteinShort', { n: nf1(r.per100.protein * f) });
    const tt = s.totals(s.view), left = dayLimit(s.settings, tt.burned) - tt.kcal;
    maybe('#calcFit', root)!.textContent = left <= 0 ? t('fitNone') : r.per100.kcal > 0 ? t('fitLeft', { n: nf(left), g: nf(left / r.per100.kcal * 100), u: r.unit }) : t('fitLeftNoKcal', { n: nf(left) });
  }
  function planHtml() {
    const m = st.plan!;
    const sum = m.reduce((a, i) => ({ kcal: a.kcal + (+i.kcal || 0), protein: a.protein + (+i.protein || 0) }), { kcal: 0, protein: 0 });
    const g = s.settings, tt = s.totals(s.view), limit = dayLimit(g, tt.burned);
    const leftAfter = limit - tt.kcal - sum.kcal, protAfter = g.protein - tt.protein - sum.protein, share = limit ? sum.kcal / limit * 100 : 0;
    return '<div class="card res"><div class="res-head"><div><div class="res-name">' + esc(t('mealPlan')) + '</div><div class="hint">' + esc(s.view === today() ? t('forToday') : fmtDate(parseD(s.view))) + '</div></div>'
      + (leftAfter >= 0 ? '<span class="pill ok">' + esc(t('fits')) + '</span>' : '<span class="pill over num">' + esc(t('wouldExceed', { n: nf(-leftAfter) })) + '</span>') + '</div>'
      + '<ul class="rows">' + m.map((it, i) => {
        const p = it.maybe ? s.products.find((q) => q.id === it.maybe) : null, u = +(it.units ?? 1) || 1;
        return '<li><div class="row static"><span class="r-main"><span class="r-name">' + esc(it.name) + '</span><span class="r-sub num">' + esc(it.amount || '') + '</span></span><span class="r-kcal num">' + nf(+it.kcal || 0) + '</span><button type="button" class="iconbtn sm" data-plan-del="' + i + '" aria-label="' + esc(t('removeFromPlan')) + '">×</button></div>'
          + (p ? '<div class="maybe"><span>' + esc(t('maybeIs', { name: p.name })) + '</span><button type="button" class="chipbtn acc" data-pmb-yes="' + i + '">' + esc(t('yes')) + ' · ' + nf(p.kcal * u) + ' kcal</button><button type="button" class="chipbtn" data-pmb-no="' + i + '">' + esc(t('no')) + '</button></div>' : '') + '</li>';
      }).join('') + '</ul>'
      + '<div class="g4 two num"><div><b>' + nf(sum.kcal) + ' kcal</b><span>' + esc(t('mealTotal', { p: nf(share) })) + '</span></div><div><b>' + nf1(sum.protein) + ' g</b><span>' + esc(t('protein')) + '</span></div>'
      + '<div><b>' + (leftAfter >= 0 ? nf(leftAfter) : '−' + nf(-leftAfter)) + ' kcal</b><span>' + esc(t(leftAfter >= 0 ? 'wouldLeave' : 'wouldOver')) + '</span></div>'
      + '<div><b>' + (protAfter > 0 ? nf(protAfter) + ' g' : '✓') + '</b><span>' + esc(t(protAfter > 0 ? 'proteinMissing' : 'proteinDone')) + '</span></div></div>'
      + '<p class="hint">' + esc(t('planHint')) + '</p><div class="btns"><button type="button" class="btn main" id="planAdd">' + esc(t('addToDiary')) + '</button><button type="button" class="btn" id="planClear">' + esc(t('close')) + '</button></div></div>';
  }
  function renderCmp() {
    const out = maybe('#cmpOut', root); if (!out) return;
    if (!st.cmp.length) { out.innerHTML = ''; return; }
    const rows = st.cmp.slice().sort((a, b) => pPer100kcal(b) - pPer100kcal(a));
    out.innerHTML = '<div class="card cmp"><div class="res-head"><h3>' + esc(t('compare')) + '</h3><button type="button" class="linkbtn small" id="cmpClear">' + esc(t('clear')) + '</button></div>'
      + '<div class="cmpwrap"><table class="num"><thead><tr><th>' + esc(t('cmpProduct')) + '</th><th>' + esc(t('cmpKcal')) + '</th><th>' + esc(t('cmpProt')) + '</th><th>' + esc(t('cmpPer100kcal')) + '</th><th></th></tr></thead><tbody>'
      + rows.map((r, i) => '<tr class="' + (i === 0 && rows.length > 1 ? 'best' : '') + '"><td>' + esc(r.name) + '</td><td>' + nf(r.per100.kcal) + '</td><td>' + nf1(r.per100.protein) + ' g</td><td>' + nf1(pPer100kcal(r)) + ' g</td><td><button type="button" class="iconbtn sm" data-cmp-del="' + esc(r.id) + '" aria-label="' + esc(t('delete')) + '">×</button></td></tr>').join('')
      + '</tbody></table></div><p class="hint">' + esc(t('cmpHint')) + '</p></div>';
  }
  function shopLinks(q: string) {
    const e = encodeURIComponent(q);
    return '<a href="https://barbora.lt/paieska?q=' + e + '" target="_blank" rel="noopener">Maxima (Barbora) ↗</a><a href="https://www.rimi.lt/e-parduotuve/lt/paieska?query=' + e + '" target="_blank" rel="noopener">Rimi ↗</a><a href="https://www.lidl.lt/q/search?q=' + e + '" target="_blank" rel="noopener">Lidl ↗</a>';
  }
  function renderAlt() {
    const out = maybe('#altOut', root), btn = maybe<HTMLButtonElement>('#altBtn', root); if (!out || !btn) return;
    btn.disabled = st.altBusy; btn.textContent = st.altBusy ? t('searching') : t('suggest');
    if (st.altBusy) { out.innerHTML = '<p class="hint">' + esc(t('lighterBusy')) + '</p>'; return; }
    const r = st.alt; if (!r) { out.innerHTML = ''; return; }
    out.innerHTML = (r.usual && r.usual.kcal ? '<p class="hint num">' + esc(t('usualCompare', { name: r.usual.name, kcal: nf(r.usual.kcal) })) + '</p>' : '')
      + '<ul class="alts">' + r.items.map((it, i) => '<li class="card"><div class="res-head"><span class="res-name sm">' + esc(it.name) + '</span><span class="num"><b>' + nf(it.kcal) + '</b> kcal/100 ' + it.unit + '</span></div>'
        + '<p class="hint">' + esc(it.why) + (it.protein ? ' · ' + esc(t('proteinShortDot', { n: nf1(it.protein) })) : '') + '</p>'
        + (!it.homemade && !it.sure ? '<p class="warn">' + esc(t('unsure')) + '</p>' : '')
        + '<div class="links">' + (it.homemade ? '' : shopLinks(it.search)) + '<button type="button" class="chipbtn" data-alt-cmp="' + i + '">' + esc(t('toCompare')) + '</button>' + (it.homemade ? '' : '<button type="button" class="chipbtn" data-alt-check="' + i + '">' + esc(t('check')) + '</button>') + '</div></li>').join('') + '</ul>'
      + '<p class="hint">' + esc(t('lighterHint')) + '</p>';
  }

  /* ---------- įvykiai ---------- */
  root.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const tab = el.closest<HTMLElement>('[data-tab]'); if (tab) { st.tab = tab.dataset.tab as AddTab; render(); return; }
    const slot = el.closest<HTMLElement>('[data-slot]'); if (slot) { st.meal = slot.dataset.slot as MealKey; render(); return; }
    if (el.closest('[data-clear-photo]')) { st.file = null; render(); return; }
    if (el.closest('[data-clear-cphoto]')) { st.cfile = null; render(); return; }
    const mp = el.closest<HTMLElement>('[data-mp]');
    if (mp) { st.mpSel = st.mpSel === mp.dataset.mp ? null : mp.dataset.mp!; root.querySelectorAll('[data-mp]').forEach((b) => b.classList.toggle('sel', (b as HTMLElement).dataset.mp === st.mpSel)); renderQty(); maybe<HTMLInputElement>('#mpN', root)?.select(); return; }
    const step = el.closest<HTMLElement>('[data-step]');
    if (step) {
      const n = inp('#mpN', root), sel = s.products.find((p) => p.id === st.mpSel);
      n.value = String(Math.max(0.25, (parseFloat(n.value) || 0) + +step.dataset.step!));
      const g = maybe<HTMLInputElement>('#mpG', root); if (sel && g && gramsPer(sel)) g.value = String(Math.round(parseFloat(n.value) * gramsPer(sel)));
      mpTot(); return;
    }
    if (el.id === 'mpAdd') { addProductQty(); return; }
    if (el.closest('[data-yday]')) {
      const yd = s.day(addDays(s.view, -1)).items.filter((i) => mealOf(i) === st.meal);
      addMealItems(yd.map(strip), t('likeYesterday').replace('↻ ', '')); return;
    }
    const ml = el.closest<HTMLElement>('[data-ml]'); if (ml) { const m = s.meals.find((x) => x.id === ml.dataset.ml); if (m) addMealItems(m.items, m.name); return; }
    const rc = el.closest<HTMLElement>('[data-recent]');
    if (rc) { const r = s.recentFoods(10)[+rc.dataset.recent!]; if (r) { s.addFood([{ ...r, id: newId(), t: Date.now(), meal: st.meal, maybe: null, units: null }]); done(t('addedTo', { what: r.name, kcal: nf(r.kcal), meal: mealLabel(st.meal) })); } return; }
    // skaičiuoklė
    if (el.id === 'calcAdd' && st.cres) {
      const r = st.cres, f = r.grams / 100;
      s.addFood([{ id: newId(), name: r.name, amount: r.grams + ' ' + r.unit, kcal: Math.round(r.per100.kcal * f), protein: r1(r.per100.protein * f), carbs: r1(r.per100.carbs * f), fat: r1(r.per100.fat * f), t: Date.now(), meal: st.meal, source: 'calc' }]);
      done(t('addedTo', { what: r.name, kcal: nf(r.per100.kcal * f), meal: mealLabel(st.meal) })); return;
    }
    if (el.id === 'calcCmp' && st.cres) {
      const r = st.cres;
      if (!st.cmp.some((c) => c.id === r.id)) { st.cmp = st.cmp.concat([{ id: r.id, name: r.name, unit: r.unit, per100: r.per100 }]).slice(-12); saveCmp(st.cmp); renderCmp(); }
      status(t('addedCmp')); return;
    }
    if (el.id === 'cmpClear') { st.cmp = []; saveCmp(st.cmp); renderCmp(); return; }
    const cd = el.closest<HTMLElement>('[data-cmp-del]'); if (cd) { st.cmp = st.cmp.filter((c) => c.id !== cd.dataset.cmpDel); saveCmp(st.cmp); renderCmp(); return; }
    const pd = el.closest<HTMLElement>('[data-plan-del]'); if (pd && st.plan) { st.plan.splice(+pd.dataset.planDel!, 1); if (!st.plan.length) st.plan = null; renderCalcOut(); return; }
    const py = el.closest<HTMLElement>('[data-pmb-yes]');
    if (py && st.plan) { const i = +py.dataset.pmbYes!; const patch = applyProduct(s.products, st.plan[i]); if (patch) st.plan[i] = { ...st.plan[i], ...patch }; renderCalcOut(); return; }
    const pn = el.closest<HTMLElement>('[data-pmb-no]'); if (pn && st.plan) { const i = +pn.dataset.pmbNo!; st.plan[i] = { ...st.plan[i], maybe: null, units: null }; renderCalcOut(); return; }
    if (el.id === 'planAdd' && st.plan) {
      const now = Date.now(), items = st.plan.map((it, i) => toFood(it, { t: now + i, source: 'calc', productId: it.productId ?? null }));
      s.addFood(items); done(t('addedPlan', { n: items.length, kcal: nf(mealKcal(items)), meal: mealLabel(st.meal) })); return;
    }
    if (el.id === 'planClear') { st.plan = null; renderCalcOut(); return; }
    const ac = el.closest<HTMLElement>('[data-alt-cmp]');
    if (ac && st.alt) {
      const it = st.alt.items[+ac.dataset.altCmp!];
      if (it && !st.cmp.some((x) => x.name === it.name)) { st.cmp = st.cmp.concat([{ id: newId(), name: it.name, unit: it.unit, per100: { kcal: it.kcal, protein: it.protein, carbs: 0, sugar: 0, fat: 0 } }]).slice(-12); saveCmp(st.cmp); renderCmp(); }
      status(t('addedCmp')); return;
    }
    const ak = el.closest<HTMLElement>('[data-alt-check]');
    if (ak && st.alt) { const it = st.alt.items[+ak.dataset.altCheck!]; if (it) { inp('#calcName', root).value = it.name; maybe<HTMLFormElement>('#calcForm', root)?.requestSubmit(); root.scrollTo({ top: 0, behavior: 'smooth' }); } }
  });

  root.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement, sel = s.products.find((p) => p.id === st.mpSel), gp = sel ? gramsPer(sel) : 0;
    if (el.id === 'mpN') { const g = maybe<HTMLInputElement>('#mpG', root); if (gp && g) g.value = String(Math.round((parseFloat(el.value) || 0) * gp)); mpTot(); }
    if (el.id === 'mpG' && gp) { inp('#mpN', root).value = String(Math.round((parseFloat(el.value) || 0) / gp * 100) / 100); mpTot(); }
    if (el.id === 'calcG' && st.cres) { const g = Math.round(parseFloat(el.value)); if (g > 0 && g <= 5000) { st.cres.grams = g; updatePortion(); } }
  });

  root.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.id === 'photoInput') { st.file = el.files?.[0] || null; render(); if (st.file) status(t('photoChosen')); }
    if (el.id === 'calcPhoto') { st.cfile = el.files?.[0] || null; render(); }
  });

  root.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    if (f.id === 'aiForm') await submitAi();
    else if (f.id === 'manForm') submitManual();
    else if (f.id === 'sportForm') submitSport();
    else if (f.id === 'calcForm') await submitCalc();
    else if (f.id === 'altForm') await submitAlt();
  });

  // Enter aprašyme = skaičiuoti (Shift+Enter – nauja eilutė)
  root.addEventListener('keydown', (e) => {
    const el = e.target as HTMLElement;
    if (el.id === 'foodInput' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); maybe<HTMLFormElement>('#aiForm', root)?.requestSubmit(); }
  });

  /* ---------- veiksmai ---------- */
  const strip = (i: FoodItem | MealItem): MealItem => ({ name: i.name, amount: i.amount || '', kcal: +i.kcal || 0, protein: +i.protein || 0, carbs: +i.carbs || 0, fat: +i.fat || 0 });
  function addMealItems(items: MealItem[], label: string) {
    if (!items.length) return;
    const now = Date.now();
    s.addFood(items.map((it, i) => toFood(strip(it), { t: now + i, source: 'meal', maybe: null, units: null })));
    done(t('addedTo', { what: label, kcal: nf(mealKcal(items)), meal: mealLabel(st.meal) }));
  }
  function addProductQty() {
    const sel = s.products.find((p) => p.id === st.mpSel), n = parseFloat(inp('#mpN', root).value);
    if (!sel || !(n > 0 && n <= 100)) return;
    const nn = Math.round(n * 100) / 100, gp = gramsPer(sel);
    s.addFood([{
      id: newId(), name: sel.name,
      amount: isGramUnit(sel) ? nf(gp * nn) + ' ' + (/ml$/i.test(sel.unit) ? 'ml' : 'g') : nf1(nn) + ' × ' + sel.unit + (gp ? ' (' + nf(gp * nn) + ' g)' : ''),
      kcal: Math.round(sel.kcal * nn), protein: r1((sel.protein || 0) * nn), carbs: r1((sel.carbs || 0) * nn), fat: r1((sel.fat || 0) * nn),
      t: Date.now(), meal: st.meal, productId: sel.id, source: 'product',
    }]);
    done(t('addedTo', { what: sel.name, kcal: nf(sel.kcal * nn), meal: mealLabel(st.meal) }));
  }
  async function submitAi() {
    if (st.busy) return;
    const raw = inp('#foodInput', root).value.trim(), file = st.file;
    if (!raw && !file) { inp('#foodInput', root).focus(); return; }
    const grams = Math.round(parseFloat(inp('#foodGrams', root).value)) || 0;
    let text = raw;
    if (grams > 0 && grams <= 5000) {
      if (!raw) text = '(' + grams + ' g)';
      else if (/\d/.test(raw)) text = raw + ' (' + grams + ' g total)';
      else text = grams + ' g ' + raw;
    }
    st.busy = true;
    const btn = inp('#aiBtn', root) as unknown as HTMLButtonElement; btn.disabled = true; btn.textContent = t('calculating');
    status(t('calculating'));
    try {
      const items = await s.ai.estimate(text, file ? await prepareImage(file) : null);
      st.busy = false;
      const now = Date.now();
      s.addFood(items.map((it, i) => toFood(it, { t: now + i })));
      done(t('addedTo', { what: items.map((i) => i.name).join(', '), kcal: nf(items.reduce((a, b) => a + b.kcal, 0)), meal: mealLabel(st.meal) }));
    } catch (err) {
      st.busy = false; btn.disabled = false; btn.textContent = t('calculate');
      status(aiErr(err), true);
      if ((err as { code?: string })?.code === 'not_configured') { const d = maybe<HTMLDetailsElement>('details.manual', root); if (d) { d.open = true; inp('#manName', root).value = raw; } }
    }
  }
  function submitManual() {
    const name = inp('#manName', root).value.trim(), k = parseFloat(inp('#manKcal', root).value);
    if (!name || !isFinite(k)) return;
    const item: FoodItem = { id: newId(), name: name.slice(0, 80), amount: '', kcal: Math.max(0, Math.round(k)), protein: Math.max(0, r1(parseFloat(inp('#manProt', root).value) || 0)), carbs: 0, fat: 0, t: Date.now(), meal: st.meal, source: 'manual' };
    s.addFood([item]);
    done(t('addedTo', { what: name, kcal: nf(item.kcal), meal: mealLabel(st.meal) }));
  }
  function submitSport() {
    const msgs: string[] = [], w = s.settings.weight;
    const min = Math.round(parseFloat(inp('#sportMin', root).value)), stRaw = inp('#stepsIn', root).value.trim();
    let changed = false;
    if (isFinite(min) && min > 0 && min <= 600) {
      const k = workoutKcal(min, w);
      s.addWorkout({ id: newId(), name: t('workout'), amount: min + ' min', minutes: min, kcal: k, t: Date.now() });
      msgs.push(t('sportWorkout', { min, kcal: nf(k) })); changed = true;
    }
    if (stRaw !== '') {
      const n = Math.round(parseFloat(stRaw));
      if (isFinite(n) && n >= 0 && n <= 100000 && n !== s.day(s.view).steps) { s.setSteps(n); msgs.push(t('sportSteps', { n: nf(n), kcal: nf(stepsKcal(n, w)) })); changed = true; }
    }
    if (!changed) { status(t('sportEmpty'), true); inp('#sportMin', root).focus(); return; }
    done(t('sportSaved', { what: msgs.join(', ') }));
  }
  async function submitCalc() {
    if (st.cbusy) return;
    const text = inp('#calcName', root).value.trim(), gr = Math.round(parseFloat(inp('#calcGrams', root).value)) || 0, file = st.cfile;
    if (!text && !file) { inp('#calcName', root).focus(); return; }
    st.cbusy = true; const btn = maybe<HTMLButtonElement>('#calcBtn', root)!; btn.disabled = true; btn.textContent = t('searching'); status('');
    try {
      if (text && !file && isMealPlan(text)) {
        const items = await s.ai.estimate(text, null);
        st.plan = items.map((it, i) => ({ ...it, key: 'm' + i })); st.cres = null;
      } else {
        const res = await s.ai.lookup(text, gr > 0 && gr <= 5000 ? gr : 0, file ? await prepareImage(file) : null);
        st.cres = { ...res, id: newId() }; st.plan = null; st.cfile = null;
      }
      st.cbusy = false; render();
    } catch (err) {
      st.cbusy = false; btn.disabled = false; btn.textContent = t('check');
      status((err as { code?: string })?.code === 'nofood' ? t('errNoProduct') : aiErr(err), true);
    }
  }
  async function submitAlt() {
    const q = inp('#altQ', root).value.trim(); if (!q || st.altBusy) return;
    st.altBusy = true; renderAlt();
    try { st.alt = await s.ai.alternatives(q); } catch (err) { status((err as { code?: string })?.code === 'nofood' ? t('errNoAlt') : aiErr(err), true); }
    st.altBusy = false; renderAlt();
  }

  render();
}
