// Receptai: visas puodas įvedamas vieną kartą (ingredientai + porcijų skaičius),
// paskui įrašoma tik suvalgyta dalis (porcijos, dalis viso arba gramai).
import { foodAsProduct, norm, searchFoods, stem } from '../../data/foods';
import { lang, t } from '../../i18n';
import { gramsPer, isGramUnit, mealKcal } from '../../lib/calc';
import { esc, newId, nf, nf1, r1 } from '../../lib/format';
import type { FoodItem, MealItem, MealKey, Product, SavedMeal } from '../../types';
import { inp, maybe, toast } from '../dom';
import { closeSheet, openSheet } from '../sheet';
import { aiErr, type AppState } from '../state';

const sum = (items: MealItem[]) => items.reduce((a, i) => ({ kcal: a.kcal + (+i.kcal || 0), protein: a.protein + (+i.protein || 0), carbs: a.carbs + (+i.carbs || 0), fat: a.fat + (+i.fat || 0) }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });

/** Recepto kūrimas arba taisymas. */
export function openRecipe(s: AppState, recipe: SavedMeal | null) {
  const st = {
    items: (recipe?.items ?? []).map((i) => ({ ...i })) as MealItem[],
    q: '', sel: null as Product | null, busy: false,
  };
  const sh = openSheet(t('editRecipe'), { id: 'recipeSheet' });
  const root = sh.body;
  root.innerHTML = '<form class="grid2" id="rcForm" autocomplete="off">'
    + '<label class="span2">' + esc(t('name')) + '<input type="text" id="rcName" maxlength="40" required placeholder="' + esc(t('recipeNamePh')) + '" value="' + esc(recipe?.name ?? '') + '"></label>'
    + '<label>' + esc(t('recipeServings')) + '<input type="number" id="rcServ" min="0.25" max="100" step="0.25" inputmode="decimal" required value="' + (recipe?.servings ?? 4) + '"></label>'
    + '<label>' + esc(t('recipeGrams')) + '<input type="number" id="rcGrams" min="1" max="50000" step="1" inputmode="numeric" placeholder="' + esc(t('recipeGramsPh')) + '" value="' + (recipe?.totalGrams ?? '') + '"></label>'
    + '</form>'
    + '<h3>' + esc(t('ingredients')) + '</h3><div id="rcItems"></div>'
    + '<div class="searchbar"><input type="search" id="rq" placeholder="' + esc(t('ingredientSearchPh')) + '" aria-label="' + esc(t('ingredientSearchPh')) + '" autocomplete="off" enterkeyhint="search"></div>'
    + '<div id="rcQty"></div><div id="rcRes"></div>'
    + '<form class="describe" id="rcAi" autocomplete="off"><textarea id="rcAiIn" rows="2" placeholder="' + esc(t('recipeAiPh')) + '" aria-label="' + esc(t('recipeAiPh')) + '"></textarea>'
    + '<button type="submit" class="btn" id="rcAiBtn">' + esc(t('recipeAiBtn')) + '</button></form>'
    + '<details class="manual"><summary>' + esc(t('manual')) + '</summary><form class="grid3" id="rcMan" autocomplete="off">'
    + '<input type="text" id="rmName" placeholder="' + esc(t('name')) + '" aria-label="' + esc(t('name')) + '" required maxlength="80">'
    + '<input type="number" id="rmKcal" placeholder="kcal" aria-label="kcal" min="0" step="1" required inputmode="numeric">'
    + '<input type="number" id="rmProt" placeholder="' + esc(t('protein')) + ', g" aria-label="' + esc(t('protein')) + ', g" min="0" step="0.1" inputmode="decimal">'
    + '<button type="submit" class="btn">' + esc(t('add')) + '</button></form></details>'
    + '<p class="hint">' + esc(t('recipeHint')) + '</p>'
    + '<div class="status" id="rcStatus" role="status"></div>'
    + '<div class="btns"><button type="button" class="btn main" id="rcSave">' + esc(t('save')) + '</button>'
    + (recipe ? '<button type="button" class="btn danger" id="rcDel">' + esc(t('deleteRecipe')) + '</button>' : '') + '</div>';

  const status = (msg: string, err = false) => { const el = maybe('#rcStatus', root); if (el) { el.textContent = msg; el.className = 'status' + (err ? ' err' : ''); } };

  function renderItems() {
    const out = maybe('#rcItems', root)!, tot = sum(st.items), serv = parseFloat(inp('#rcServ', root).value) || 1;
    out.innerHTML = (st.items.length
      ? '<ul class="rows ingr">' + st.items.map((it, i) => '<li><div class="row static"><span class="r-main"><span class="r-name">' + esc(it.name) + '</span><span class="r-sub num">' + esc(it.amount || '') + (it.amount ? ' · ' : '') + esc(t('proteinShort', { n: nf1(+it.protein || 0) })) + '</span></span><span class="r-kcal num">' + nf(+it.kcal || 0) + '</span><button type="button" class="iconbtn sm" data-rc-del="' + i + '" aria-label="' + esc(t('delete')) + '">×</button></div></li>').join('') + '</ul>'
        + '<p class="num"><b>' + esc(t('recipeTotal', { kcal: nf(tot.kcal), p: nf(tot.protein) })) + '</b><br><span class="hint">' + esc(t('recipePerServing', { kcal: nf(tot.kcal / serv), p: nf1(tot.protein / serv) })) + '</span></p>'
      : '<p class="hint">' + esc(t('recipeEmpty')) + '</p>');
  }

  function renderRes() {
    const out = maybe('#rcRes', root)!, q = st.q.trim();
    if (!q) { out.innerHTML = ''; return; }
    const nq = norm(q);
    const mine = s.products.filter((p) => nq.split(' ').map(stem).every((w) => norm(p.name).includes(w))).slice(0, 5);
    const list = mine.concat(searchFoods(q, 8).map((f) => foodAsProduct(f, lang())));
    out.innerHTML = list.length
      ? '<ul class="rows results">' + list.map((p, i) => '<li><button type="button" class="row" data-rc-pick="' + i + '"><span class="r-main"><span class="r-name">' + esc(p.name) + '</span><span class="r-sub num">' + nf(p.kcal) + ' kcal / ' + esc(p.unit) + '</span></span></button></li>').join('') + '</ul>'
      : '<p class="hint">' + esc(t('noResults')) + '</p>';
    resList = list;
  }
  let resList: Product[] = [];

  function renderQty() {
    const q = maybe('#rcQty', root)!, p = st.sel;
    if (!p) { q.innerHTML = ''; return; }
    const gramOnly = isGramUnit(p), gp = gramsPer(p);
    q.innerHTML = '<div class="qty"><div class="res-head"><b>' + esc(p.name) + '</b><button type="button" class="iconbtn sm" id="riCancel" aria-label="' + esc(t('cancel')) + '">×</button></div>'
      + '<div class="qty-row">' + (gramOnly ? '' : '<input type="number" class="gin" id="riN" value="1" min="0.1" step="0.5" inputmode="decimal" aria-label="' + esc(t('quantity')) + '"><span>' + esc(p.unit) + '</span>' + (gp ? '<span>' + esc(t('orGrams')) + '</span>' : ''))
      + (gp ? '<input type="number" class="gin" id="riG" min="1" max="20000" inputmode="numeric" aria-label="g" value="' + Math.round(gp) + '"><span>g</span>' : '') + '</div>'
      + '<div class="qty-row"><span class="tot num" id="riTot"></span><button type="button" class="btn main" id="riAdd">' + esc(t('add')) + '</button></div></div>';
    riTot();
    (maybe<HTMLInputElement>('#riG', root) ?? maybe<HTMLInputElement>('#riN', root))?.select();
  }
  /** Pasirinkto produkto kiekis vienetais. */
  function riUnits(): number {
    const p = st.sel!, gp = gramsPer(p), n = maybe<HTMLInputElement>('#riN', root), g = maybe<HTMLInputElement>('#riG', root);
    if (n) return parseFloat(n.value) || 0;
    return gp && g ? (parseFloat(g.value) || 0) / gp : 0;
  }
  function riTot() {
    const p = st.sel, el = maybe('#riTot', root); if (!p || !el) return;
    const u = riUnits(); el.textContent = '= ' + nf(p.kcal * u) + ' kcal, ' + t('proteinShort', { n: nf1(p.protein * u) });
  }

  function save() {
    const name = inp('#rcName', root).value.trim().slice(0, 40), serv = r1(parseFloat(inp('#rcServ', root).value.replace(',', '.')));
    const gRaw = inp('#rcGrams', root).value.trim(), grams = gRaw ? Math.round(parseFloat(gRaw)) : null;
    if (!name || !st.items.length) { status(t('recipeNeed'), true); return; }
    if (!(serv >= 0.25 && serv <= 100) || (grams != null && !(grams >= 1 && grams <= 50000))) { status(t('obInvalid'), true); return; }
    const m: SavedMeal = { id: recipe?.id ?? newId(), name, items: st.items.slice(0, 50), servings: serv, totalGrams: grams };
    if (recipe) s.replaceMeal(m); else s.addMeal(m);
    closeSheet();
    toast(t('recipeSaved', { name }));
  }

  root.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const del = el.closest<HTMLElement>('[data-rc-del]'); if (del) { st.items.splice(+del.dataset.rcDel!, 1); renderItems(); return; }
    const pk = el.closest<HTMLElement>('[data-rc-pick]'); if (pk) { st.sel = resList[+pk.dataset.rcPick!] ?? null; renderQty(); maybe('#rcQty', root)?.scrollIntoView({ block: 'nearest' }); return; }
    if (el.id === 'riCancel') { st.sel = null; renderQty(); return; }
    if (el.id === 'riAdd' && st.sel) {
      const p = st.sel, u = Math.round(riUnits() * 100) / 100, gp = gramsPer(p);
      if (!(u > 0)) return;
      st.items.push({
        name: p.name.slice(0, 80), amount: (isGramUnit(p) || !maybe('#riN', root) ? nf(gp * u) + ' g' : nf1(u) + ' × ' + p.unit + (gp ? ' (' + nf(gp * u) + ' g)' : '')).slice(0, 60),
        kcal: Math.round(p.kcal * u), protein: r1(p.protein * u), carbs: r1((p.carbs || 0) * u), fat: r1((p.fat || 0) * u),
      });
      st.sel = null; st.q = ''; inp('#rq', root).value = '';
      renderQty(); renderRes(); renderItems(); inp('#rq', root).focus();
      return;
    }
    if (el.id === 'rcSave') { save(); return; }
    if (el.id === 'rcDel' && recipe) { closeSheet(); s.deleteMeal(recipe.id); toast(t('deleted', { what: recipe.name }), { label: t('undo'), run: () => s.addMeal(recipe) }); }
  });
  root.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.id === 'rq') { st.q = el.value; st.sel = null; renderQty(); renderRes(); }
    if (el.id === 'rcServ') renderItems();
    if (el.id === 'riN' || el.id === 'riG') {
      const gp = st.sel ? gramsPer(st.sel) : 0, g = maybe<HTMLInputElement>('#riG', root), n = maybe<HTMLInputElement>('#riN', root);
      if (el.id === 'riN' && g && gp) g.value = String(Math.round((parseFloat(el.value) || 0) * gp));
      if (el.id === 'riG' && n && gp) n.value = String(Math.round((parseFloat(el.value) || 0) / gp * 100) / 100);
      riTot();
    }
  });
  root.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    if (f.id === 'rcForm') { save(); return; }
    if (f.id === 'rcMan') {
      const name = inp('#rmName', root).value.trim(), k = parseFloat(inp('#rmKcal', root).value);
      if (!name || !(k >= 0)) return;
      st.items.push({ name: name.slice(0, 80), amount: '', kcal: Math.round(k), protein: Math.max(0, r1(parseFloat(inp('#rmProt', root).value) || 0)), carbs: 0, fat: 0 });
      f.reset(); renderItems(); return;
    }
    if (f.id === 'rcAi') {
      const text = inp('#rcAiIn', root).value.trim(); if (!text || st.busy) return;
      st.busy = true; const btn = maybe<HTMLButtonElement>('#rcAiBtn', root)!; btn.disabled = true; btn.textContent = t('calculating'); status('');
      try {
        const items = await s.ai.estimate(text, null);
        st.items.push(...items.map((i) => ({ name: i.name, amount: i.amount || '', kcal: Math.round(+i.kcal || 0), protein: +i.protein || 0, carbs: +i.carbs || 0, fat: +i.fat || 0 })));
        inp('#rcAiIn', root).value = ''; renderItems();
      } catch (err) { status(aiErr(err), true); }
      st.busy = false; btn.disabled = false; btn.textContent = t('recipeAiBtn');
    }
  });
  renderItems();
  if (!recipe) inp('#rcName', root).focus();
}

/** Suvalgyta recepto dalis → vienas dienoraščio įrašas. `portions` – porcijos (servings = visas receptas). */
export function recipeEntry(r: SavedMeal, portions: number, meal: MealKey, grams?: number | null): FoodItem {
  const serv = r.servings || 1, f = portions / serv, tot = sum(r.items);
  const amount = t('recipeAmount', { n: nf1(portions), m: nf1(serv) }) + (r.totalGrams ? ' · ' + nf(grams ?? r.totalGrams * f) + ' g' : '');
  return {
    id: newId(), name: r.name, amount: amount.slice(0, 60), kcal: Math.round(tot.kcal * f), protein: r1(tot.protein * f), carbs: r1(tot.carbs * f), fat: r1(tot.fat * f),
    t: Date.now(), meal, source: 'recipe',
  };
}

export const recipeKcal = (r: SavedMeal) => mealKcal(r.items);
