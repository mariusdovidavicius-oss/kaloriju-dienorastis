// Pagrindinis programos langas: dienos suvestinė, įvedimas (Maistas / Sportas / Skaičiuoklė),
// dienoraštis, Mano produktai, Dažni valgiai, statistika ir tikslai.
// Logika perkelta iš Artifact versijos (v16); saugojimas – per Store, AI – per AiClient.

import type { AiClient } from '../ai/client';
import { emptyDay, type Store } from '../data/store';
import {
  baseline, bmr, dayLimit, dayStat, gramsPer, isGramUnit, isMealPlan, MEALS, mealKcal, mealLabel, mealOf,
  pPer100kcal, slotByHour, stepsKcal, totals, verdict, workoutKcal, KCAL_PER_KG_FAT,
} from '../lib/calc';
import { addDays, parseD, periodDays, today } from '../lib/dates';
import { countWord, dateFmt, esc, newId, nf, nf1, r1, stampFmt, timeFmt, wdFmt } from '../lib/format';
import { prepareImage } from '../lib/image';
import type {
  AlternativesResult, Day, EstimatedItem, FoodItem, ImageInput, Insight, LookupResult, MealItem, MealKey, Product, SavedMeal, Settings, Workout,
} from '../types';
import { $, inp, toast } from './dom';

const LOAD_DAYS = 120;
const CMP_KEY = 'kalorijos-cmp';

type Kind = 'food' | 'sport' | 'calc';
interface CmpRow { id: string; name: string; unit: 'g' | 'ml'; per100: LookupResult['per100'] }
interface CalcRes extends LookupResult { id: string }
interface PlanItem extends EstimatedItem { key: string }

export interface AppContext {
  store: Store;
  ai: AiClient;
  mock: boolean;
  onLogout: () => void;
}

export async function startApp(ctx: AppContext) {
  const { store, ai } = ctx;

  const state = {
    loading: true,
    days: {} as Record<string, Day>,
    loadedFrom: addDays(today(), -LOAD_DAYS),
    settings: null as unknown as Settings,
    products: [] as Product[],
    meals: [] as SavedMeal[],
    insight: null as Insight | null,
    insightLive: null as string | null,
    insightBusy: false,
    statsN: 7,
    view: today(),
    kind: 'food' as Kind,
    slot: null as MealKey | null,
    savingSlot: null as MealKey | null,
    editing: null as string | null,
    mpSel: null as string | null,
    mpManage: false,
    busy: false,
    file: null as File | null,
    cbusy: false,
    cfile: null as File | null,
    cres: null as CalcRes | null,
    plan: null as PlanItem[] | null,
    cmp: loadCmp(),
    alt: null as AlternativesResult | null,
    altBusy: false,
  };

  /* ---------- saugojimas ---------- */
  // Visi įrašymai vykdomi eilės tvarka, kad, pvz., taisymas neaplenktų įrašymo.
  let queue: Promise<unknown> = Promise.resolve();
  function save(fn: () => Promise<unknown>) {
    queue = queue.then(fn).catch((e) => {
      console.error(e);
      toast('Nepavyko išsaugoti. Patikrink ryšį – duomenys perkraunami.');
      void reload();
    });
    return queue;
  }
  async function reload() {
    try {
      const data = await store.loadInitial(state.loadedFrom);
      Object.assign(state, { days: data.days, settings: data.settings, products: data.products, meals: data.meals, insight: data.insight });
      render();
    } catch (e) { console.error(e); }
  }
  async function ensureLoaded(date: string) {
    if (date >= state.loadedFrom) return;
    const from = addDays(date, -30), to = addDays(state.loadedFrom, -1);
    try {
      const more = await store.loadRange(from, to);
      state.days = { ...more, ...state.days };
      state.loadedFrom = from;
      render();
    } catch { toast('Nepavyko įkelti senesnių dienų.'); }
  }

  /* ---------- dienos pagalbininkai ---------- */
  const day = (d: string): Day => state.days[d] || emptyDay(d);
  const dayItems = (d: string) => day(d).items;
  const dayEx = (d: string) => day(d).ex;
  const daySteps = (d: string) => day(d).steps;
  const setDay = (d: string, patch: Partial<Day>) => { state.days = { ...state.days, [d]: { ...day(d), ...patch } }; };
  const curSlot = (): MealKey => state.slot || slotByHour(new Date().getHours());
  const tot = (d: string) => totals(state.days[d], state.settings);

  function addFood(items: FoodItem[]) {
    const d = state.view;
    setDay(d, { items: dayItems(d).concat(items) });
    render();
    save(() => store.addFood(d, items));
  }
  function addWorkout(w: Workout) {
    const d = state.view;
    setDay(d, { ex: dayEx(d).concat([w]) });
    save(() => store.addWorkout(d, w));
  }
  function removeItem(id: string) {
    const d = state.view;
    const isEx = dayEx(d).some((i) => i.id === id);
    setDay(d, { items: dayItems(d).filter((i) => i.id !== id), ex: dayEx(d).filter((i) => i.id !== id) });
    render();
    save(() => (isEx ? store.deleteWorkout(id) : store.deleteFood(id)));
  }
  function updateFood(id: string, patch: Partial<FoodItem>) {
    const d = state.view;
    setDay(d, { items: dayItems(d).map((i) => (i.id === id ? { ...i, ...patch } : i)) });
    state.editing = null; render();
    save(() => store.updateFood(id, patch));
  }
  function updateWorkout(id: string, patch: Partial<Workout>) {
    const d = state.view;
    setDay(d, { ex: dayEx(d).map((i) => (i.id === id ? { ...i, ...patch } : i)) });
    state.editing = null; render();
    save(() => store.updateWorkout(id, patch));
  }
  function setSteps(steps: number) {
    const d = state.view;
    setDay(d, { steps });
    save(() => store.setSteps(d, steps));
  }
  function persistSettings() { const s = state.settings; save(() => store.saveSettings(s)); }

  /** AI įvertinimą paverčia dienoraščio įrašu. */
  function toFood(it: EstimatedItem | MealItem, extra: Partial<FoodItem> = {}): FoodItem {
    const e = it as EstimatedItem;
    return {
      id: newId(), name: it.name, amount: it.amount || '', kcal: Math.round(+it.kcal || 0), protein: +it.protein || 0, carbs: +it.carbs || 0, fat: +it.fat || 0,
      t: Date.now(), meal: curSlot(), maybe: e.maybe ?? null, units: e.units ?? null, source: 'ai', ...extra,
    };
  }

  /* ---------- klaidos ---------- */
  function aiErr(e: unknown): string {
    const c = (e as { code?: string })?.code;
    if (c === 'not_configured') return 'Claude dar neprijungtas (serveryje trūksta API rakto). Kol kas įvesk rankiniu būdu.';
    if (c === 'daily_limit') return 'Šiandienos AI užklausų limitas išnaudotas. Rytoj vėl veiks; kol kas įvesk rankiniu būdu.';
    if (c === 'busy') return 'Claude šiuo metu perkrautas. Pabandyk po minutės.';
    if (c === 'image_rejected') return 'Šios nuotraukos nepavyko apdoroti. Pabandyk kitą.';
    if (c === 'session_expired') return 'Prisijungimas baigėsi. Prisijunk iš naujo.';
    if (c === 'nofood') return 'Neatpažinau maisto. Aprašyk konkrečiau, pvz., „2 kiaušiniai“.';
    if (c === 'parse' || c === 'upstream') return 'Nepavyko įvertinti. Pabandyk aprašyti kitaip, pvz., „150 g virtų ryžių“.';
    return 'Ryšio klaida. Bandyk dar kartą.';
  }
  function setStatus(msg: string, err = false) {
    const el = $('#status'); el.textContent = msg || ''; el.className = 'status' + (err ? ' err' : '');
  }
  async function image(file: File | null): Promise<ImageInput | null> {
    return file ? prepareImage(file) : null;
  }

  /* ---------- „Gal tai …?“ ---------- */
  function maybeHtml(it: { maybe?: string | null; units?: number | null }, key: string) {
    if (!it.maybe) return '';
    const p = state.products.find((q) => q.id === it.maybe); if (!p) return '';
    const u = +(it.units ?? 1) || 1;
    return '<div class="maybe"><span>Gal tai <b>' + esc(p.name) + '</b>?</span><button type="button" data-mb-yes="' + esc(key) + '">Taip (' + nf.format(p.kcal * u) + ' kcal)</button><button type="button" data-mb-no="' + esc(key) + '">Ne</button></div>';
  }
  function applyProduct(it: { maybe?: string | null; units?: number | null }) {
    const p = state.products.find((q) => q.id === it.maybe); if (!p) return null;
    const u = +(it.units ?? 1) || 1;
    return {
      name: p.name, amount: nf1.format(u) + ' × ' + p.unit + (p.grams ? ' (' + nf.format(p.grams * u) + ' g)' : ''),
      kcal: Math.round(p.kcal * u), protein: r1((p.protein || 0) * u), carbs: r1((p.carbs || 0) * u), fat: r1((p.fat || 0) * u),
      maybe: null, units: null, productId: p.id,
    };
  }

  /* ---------- piešimas ---------- */
  function render() {
    if (!state.settings) return;
    const td = today(), v = state.view;
    const dl = dateFmt.format(parseD(v));
    $('#dateLbl').textContent = v === td ? 'Šiandien, ' + dl : dl.charAt(0).toUpperCase() + dl.slice(1);
    $<HTMLButtonElement>('#next').disabled = v >= td;
    $('#todayBtn').hidden = v === td;

    const g = state.settings, t = tot(v);
    const limit = dayLimit(g, t.burned);
    $('#kcalVal').textContent = nf.format(t.kcal);
    $('#kcalOf').textContent = '/ ' + nf.format(limit) + ' kcal';
    const left = limit - t.kcal, chip = $('#leftChip');
    chip.className = 'chip num ' + (left >= 0 ? 'ok' : 'over');
    chip.textContent = left >= 0 ? 'Liko ' + nf.format(left) : 'Viršyta ' + nf.format(-left);
    const out = baseline(g) + t.burned, net = t.kcal - out;
    $('#balIn').textContent = nf.format(t.kcal);
    $('#balOut').textContent = nf.format(out);
    $('#balLbl').textContent = net <= 0 ? 'Deficitas' : 'Perteklius';
    const bn = $('#balNet'); bn.textContent = nf.format(Math.abs(net)); bn.className = net <= 0 ? 'def' : 'sur';
    $('#balHint').textContent = 'Kūnas natūraliai sudegina ~' + nf.format(baseline(g)) + ' kcal per dieną be judėjimo (bazinė apykaita ' + nf.format(bmr(g)) + ' + maisto virškinimas)'
      + (t.burned ? ', sportas ir žingsniai dar ' + nf.format(t.burned) + ' kcal' : '') + '.'
      + (v === td && t.kcal ? ' Diena dar nesibaigė, todėl deficitas vakare bus mažesnis.' : '')
      + (g.addBurned && t.burned ? ' Sportas pridėtas prie limito.' : '');

    const sport = state.kind === 'sport', calc = state.kind === 'calc';
    $('#addSec').classList.toggle('sport', sport);
    $('#kindFood').setAttribute('aria-pressed', String(state.kind === 'food'));
    $('#kindSport').setAttribute('aria-pressed', String(sport));
    $('#kindCalc').setAttribute('aria-pressed', String(calc));
    $('#calcSec').hidden = !calc;
    $('#addForm').hidden = sport || calc;
    $('#manual').hidden = sport || calc;
    $('#calcFileChip').hidden = !state.cfile;
    if (state.cfile) $('#calcFileName').textContent = state.cfile.name || 'nuotrauka';
    $<HTMLButtonElement>('#calcBtn').disabled = state.cbusy;
    renderCmp();
    if (state.cres) updatePortion();
    if (state.plan) renderPlan();
    $('#sportForm').hidden = !sport;
    $('#sportHint').hidden = !sport;
    const si = inp('#stepsIn');
    if (document.activeElement !== si) { const st = daySteps(v); si.value = st ? String(st) : ''; }

    const kp = limit ? t.kcal / limit * 100 : 0;
    $('#kcalPct').textContent = nf.format(kp) + ' %';
    const kb = $('#kcalBar'); kb.style.width = Math.min(100, kp) + '%'; kb.style.background = kp > 100 ? 'var(--over)' : 'var(--accent)';
    $('#protTxt').textContent = nf.format(t.protein) + ' / ' + nf.format(g.protein) + ' g';
    $('#protBar').style.width = Math.min(100, g.protein ? t.protein / g.protein * 100 : 0) + '%';
    $('#macros').innerHTML = '<span>Angliavandeniai: <b>' + nf.format(t.carbs) + ' g</b></span><span>Riebalai: <b>' + nf.format(t.fat) + ' g</b></span>';

    $('#photoLbl').hidden = sport || calc;
    $('#fileChip').hidden = !state.file || sport || calc;
    if (state.file) $('#fileName').textContent = state.file.name || 'nuotrauka';
    $<HTMLButtonElement>('#addBtn').disabled = state.busy;

    renderLog(v);
    renderStats();
    renderProds();
    renderSlots();
    $('#myProds').hidden = state.kind !== 'food';

    const set = (sel: string, val: number) => { const el = inp(sel); if (document.activeElement !== el) el.value = String(val); };
    set('#goalKcal', g.kcal); set('#goalProt', g.protein); set('#goalWeight', g.weight); set('#goalAge', g.age); set('#goalHeight', g.height);
    $<HTMLSelectElement>('#goalSex').value = g.sex;
    inp('#addBurned').checked = g.addBurned;
    inp('#accurate').checked = g.accurate;
  }

  function renderLog(v: string) {
    const exAll = dayEx(v).slice().sort((a, b) => (a.t || 0) - (b.t || 0));
    const food = dayItems(v).slice().sort((a, b) => (a.t || 0) - (b.t || 0));
    const total = food.length + exAll.length;
    $('#countTxt').textContent = total ? countWord(total) : '';
    const body = $('#logBody');
    if (state.loading) { body.innerHTML = '<div class="empty">Kraunami tavo įrašai…</div>'; return; }
    const steps = daySteps(v);
    if (!total && !steps && !state.busy) {
      const exs = ['bananas', '300 g vištienos krūtinėlės', '2 kiaušiniai ir duonos riekė', 'kava su pienu'];
      body.innerHTML = '<div class="empty"><div>Šiai dienai dar nieko neįrašyta. Parašyk, ką suvalgei, ir kalorijos bus paskaičiuotos automatiškai. Treniruotes ir žingsnius įrašysi skiltyje „Sportas“.</div>'
        + (state.kind === 'food' ? '<div class="examples">' + exs.map((x) => '<button type="button" data-ex="' + esc(x) + '">' + esc(x) + '</button>').join('') + '</div>' : '')
        + '</div>';
      return;
    }
    const row = (it: FoodItem | Workout, isEx: boolean) => {
      const tm = it.t ? timeFmt.format(new Date(it.t)) : '';
      if (state.editing === it.id) {
        const f = it as FoodItem;
        return '<li class="' + (isEx ? 'ex' : '') + '"><span class="time num">' + tm + '</span><div class="what"><div class="n">' + esc(it.name) + '</div><div class="a">' + esc(it.amount || '') + '</div></div>'
          + '<form class="editrow" data-edit="' + it.id + '" data-isex="' + (isEx ? 1 : 0) + '" style="grid-column:3/5"><input type="number" name="k" min="0" step="1" value="' + (+it.kcal || 0) + '" aria-label="kcal">'
          + (isEx ? '' : '<input type="number" name="p" min="0" step="0.1" value="' + (+f.protein || 0) + '" aria-label="baltymai g"><select name="m" aria-label="Valgymas">' + MEALS.map((m) => '<option value="' + m[0] + '"' + (mealOf(f) === m[0] ? ' selected' : '') + '>' + m[1] + '</option>').join('') + '</select>')
          + '<button type="submit">Gerai</button></form></li>';
      }
      return '<li class="' + (isEx ? 'ex' : '') + '"><span class="time num">' + tm + '</span><div class="what"><div class="n">' + esc(it.name) + '</div>' + (it.amount ? '<div class="a">' + esc(it.amount) + '</div>' : '') + (isEx ? '' : maybeHtml(it as FoodItem, it.id)) + '</div>'
        + (isEx ? '<div class="kc num">−' + nf.format(+it.kcal || 0) + ' kcal<small>sudeginta</small></div>'
          : '<div class="kc num">' + nf.format(+it.kcal || 0) + ' kcal<small>' + nf1.format(+(it as FoodItem).protein || 0) + ' g baltymų</small></div>')
        + '<div class="rowbtns"><button type="button" data-ed="' + it.id + '" aria-label="Taisyti" title="Taisyti">✎</button><button type="button" data-del="' + it.id + '" aria-label="Ištrinti" title="Ištrinti">×</button></div></li>';
    };
    let html = '<ul class="items">';
    for (const [key, label] of MEALS) {
      const its = food.filter((i) => mealOf(i) === key);
      if (!its.length) continue;
      const k = its.reduce((a, i) => a + (+i.kcal || 0), 0), pr = its.reduce((a, i) => a + (+i.protein || 0), 0);
      html += '<li class="grp"><span class="gname">' + label + '</span><span class="gsum num">' + nf.format(k) + ' kcal · ' + nf.format(pr) + ' g baltymų</span>'
        + (state.savingSlot === key
          ? '<form data-save-form="' + key + '"><input type="text" name="nm" maxlength="40" value="' + esc(label) + '" aria-label="Valgio pavadinimas"><button type="submit">Išsaugoti</button><button type="button" data-save-cancel>Atšaukti</button></form>'
          : '<button type="button" data-save-meal="' + key + '" title="Išsaugoti kaip dažną valgį">☆ Išsaugoti</button>')
        + '</li>';
      for (const it of its) html += row(it, false);
    }
    if (exAll.length || steps) {
      const b = exAll.reduce((a, i) => a + (+i.kcal || 0), 0) + stepsKcal(steps, state.settings.weight);
      html += '<li class="grp"><span class="gname">Sportas</span><span class="gsum num">−' + nf.format(b) + ' kcal</span></li>';
      for (const it of exAll) html += row(it, true);
      if (steps) html += '<li class="ex steps"><span class="time num"></span><div class="what"><div class="n">Žingsniai</div><div class="a num">' + nf.format(steps) + ' per dieną</div></div>'
        + '<div class="kc num">−' + nf.format(stepsKcal(steps, state.settings.weight)) + ' kcal<small>sudeginta</small></div>'
        + '<div class="rowbtns"><button type="button" data-steps-edit aria-label="Taisyti žingsnius" title="Taisyti">✎</button><button type="button" data-steps-del aria-label="Ištrinti žingsnius" title="Ištrinti">×</button></div></li>';
    }
    if (state.busy) html += '<li><span class="time num">' + timeFmt.format(new Date()) + '</span><div class="what pending">Skaičiuoju…</div><span></span><span></span></li>';
    html += '</ul>';
    body.innerHTML = html;
  }

  function renderSlots() {
    const c = curSlot();
    $('#slots').innerHTML = MEALS.map((m) => '<button type="button" data-slot="' + m[0] + '" aria-pressed="' + (c === m[0]) + '">' + m[1] + '</button>').join('');
    $('#slots').hidden = state.kind !== 'food';
  }

  /* ---------- įvykiai: data ---------- */
  const goDay = (d: string) => { state.view = d; state.editing = null; render(); void ensureLoaded(addDays(d, -1)); };
  $('#prev').onclick = () => goDay(addDays(state.view, -1));
  $('#next').onclick = () => { if (state.view < today()) goDay(addDays(state.view, 1)); };
  $('#todayBtn').onclick = () => goDay(today());
  $('#slots').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-slot]');
    if (b) { state.slot = b.dataset.slot as MealKey; renderSlots(); renderProds(); }
  });

  /* ---------- maistas ---------- */
  $('#addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.busy) return;
    const raw = inp('#foodInput').value.trim();
    const file = state.file;
    if (!raw && !file) { inp('#foodInput').focus(); return; }
    const grams = Math.round(parseFloat(inp('#foodGrams').value)) || 0;
    let text = raw;
    if (grams > 0 && grams <= 5000) {
      if (!raw) text = '(nuotraukoje esančio maisto svoris ' + grams + ' g)';
      else if (/\d/.test(raw)) text = raw + ' (viso įrašo bendras svoris ' + grams + ' g)';
      else text = grams + ' g ' + raw;
    }
    state.busy = true; setStatus(file ? 'Žiūriu nuotrauką… tai gali užtrukti iki minutės.' : 'Skaičiuoju…'); render();
    try {
      const items = await ai.estimate(text, await image(file));
      state.busy = false;
      inp('#foodInput').value = ''; inp('#foodGrams').value = '';
      state.file = null; inp('#photoInput').value = '';
      const now = Date.now();
      addFood(items.map((it, i) => toFood(it, { t: now + i, source: 'ai' })));
      setStatus('Pridėta: ' + items.map((i) => i.name).join(', ') + ' (' + nf.format(items.reduce((a, b) => a + b.kcal, 0)) + ' kcal)');
    } catch (err) {
      state.busy = false;
      if ((err as { code?: string })?.code === 'not_configured') $<HTMLDetailsElement>('#manual').open = true;
      setStatus(aiErr(err), true);
      render();
    }
  });

  $('#logBody').addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const ex = t.closest<HTMLElement>('[data-ex]'); if (ex) { inp('#foodInput').value = ex.dataset.ex || ''; inp('#foodInput').focus(); return; }
    if (t.closest('[data-steps-del]')) { setSteps(0); render(); return; }
    if (t.closest('[data-steps-edit]')) { state.kind = 'sport'; render(); const si = inp('#stepsIn'); si.focus(); si.select(); return; }
    const my = t.closest<HTMLElement>('[data-mb-yes]');
    if (my) { const id = my.dataset.mbYes!; const it = dayItems(state.view).find((i) => i.id === id); const patch = it && applyProduct(it); if (patch) { updateFood(id, patch); setStatus('Pakeista į: ' + patch.name + ' (' + patch.kcal + ' kcal)'); } return; }
    const mn = t.closest<HTMLElement>('[data-mb-no]'); if (mn) { updateFood(mn.dataset.mbNo!, { maybe: null, units: null }); return; }
    const sv = t.closest<HTMLElement>('[data-save-meal]');
    if (sv) { state.savingSlot = sv.dataset.saveMeal as MealKey; render(); const i = document.querySelector<HTMLInputElement>('[data-save-form] input'); if (i) { i.focus(); i.select(); } return; }
    if (t.closest('[data-save-cancel]')) { state.savingSlot = null; render(); return; }
    const del = t.closest<HTMLElement>('[data-del]'); if (del) { removeItem(del.dataset.del!); return; }
    const ed = t.closest<HTMLElement>('[data-ed]');
    if (ed) { state.editing = ed.dataset.ed!; render(); document.querySelector<HTMLInputElement>('.editrow input')?.focus(); }
  });
  $('#logBody').addEventListener('submit', (e) => {
    const t = e.target as HTMLElement;
    const sf = t.closest<HTMLFormElement>('[data-save-form]');
    if (sf) {
      e.preventDefault();
      const key = sf.dataset.saveForm as MealKey;
      const nm = ((sf.elements.namedItem('nm') as HTMLInputElement).value || '').trim().slice(0, 40) || mealLabel(key);
      const its: MealItem[] = dayItems(state.view).filter((i) => mealOf(i) === key).map(stripItem);
      if (its.length) {
        const meal: SavedMeal = { id: newId(), name: nm, items: its };
        state.meals = state.meals.concat([meal]);
        save(() => store.addMeal(meal));
        setStatus('Išsaugota: „' + nm + '“ (' + nf.format(mealKcal(its)) + ' kcal). Rasi ją „Dažni valgiai“.');
      }
      state.savingSlot = null; render(); return;
    }
    const f = t.closest<HTMLFormElement>('[data-edit]'); if (!f) return;
    e.preventDefault();
    const val = (n: string) => (f.elements.namedItem(n) as HTMLInputElement | null)?.value;
    const k = Math.max(0, Math.round(parseFloat(val('k') || '') || 0));
    if (f.dataset.isex === '1') { updateWorkout(f.dataset.edit!, { kcal: k }); return; }
    const patch: Partial<FoodItem> = { kcal: k };
    if (val('p') !== undefined) patch.protein = Math.max(0, r1(parseFloat(val('p') || '') || 0));
    if (val('m')) patch.meal = val('m') as MealKey;
    updateFood(f.dataset.edit!, patch);
  });

  $('#manForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = inp('#manName').value.trim(), k = parseFloat(inp('#manKcal').value);
    if (!name || !isFinite(k)) return;
    addFood([{
      id: newId(), name: name.slice(0, 80), amount: '', kcal: Math.max(0, Math.round(k)), protein: Math.max(0, r1(parseFloat(inp('#manProt').value) || 0)),
      carbs: 0, fat: 0, t: Date.now(), meal: curSlot(), source: 'manual',
    }]);
    $<HTMLFormElement>('#manForm').reset(); setStatus('Pridėta: ' + name);
  });

  /* ---------- sportas ---------- */
  $('#sportForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const d = state.view, msgs: string[] = [];
    const min = Math.round(parseFloat(inp('#sportMin').value));
    const stRaw = inp('#stepsIn').value.trim();
    let changed = false;
    if (isFinite(min) && min > 0 && min <= 600) {
      const k = workoutKcal(min, state.settings.weight);
      addWorkout({ id: newId(), name: 'Treniruotė', amount: min + ' min', minutes: min, kcal: k, t: Date.now() });
      msgs.push('treniruotė ' + min + ' min (−' + nf.format(k) + ' kcal)'); changed = true;
    }
    if (stRaw !== '') {
      const s = Math.round(parseFloat(stRaw));
      if (isFinite(s) && s >= 0 && s <= 100000 && s !== daySteps(d)) {
        setSteps(s); changed = true;
        msgs.push(nf.format(s) + ' žingsnių (−' + nf.format(stepsKcal(s, state.settings.weight)) + ' kcal)');
      }
    }
    if (!changed) { setStatus('Įvesk minutes arba žingsnius.', true); inp('#sportMin').focus(); return; }
    inp('#sportMin').value = '';
    render();
    setStatus('Išsaugota: ' + msgs.join(', '));
  });

  /* ---------- skaičiuoklė ---------- */
  function loadCmp(): CmpRow[] {
    try { const v = JSON.parse(localStorage.getItem(CMP_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  }
  function saveCmp() { try { localStorage.setItem(CMP_KEY, JSON.stringify(state.cmp)); } catch { /* privatus režimas */ } }

  function renderCalc() {
    const out = $('#calcOut'), r = state.cres;
    if (!r) { out.innerHTML = ''; return; }
    const [cls, txt] = verdict(r), u = r.unit;
    out.innerHTML = '<div class="rescard"><div class="reshead"><div><div class="resname">' + esc(r.name) + '</div><div class="a">100 ' + u + (r.portionDesc ? ' · porcija: ' + esc(r.portionDesc) + ' (' + r.grams + ' ' + u + ')' : '') + '</div></div><span class="chip ' + cls + '">' + txt + '</span></div>'
      + '<div class="g4 num"><div><b>' + nf.format(r.per100.kcal) + '</b><span>kcal</span></div><div><b>' + nf1.format(r.per100.protein) + '</b><span>baltymai, g</span></div><div><b>' + nf1.format(r.per100.carbs) + '</b><span>angliav., g' + (r.per100.sugar ? ' (cukr. ' + nf1.format(r.per100.sugar) + ')' : '') + '</span></div><div><b>' + nf1.format(r.per100.fat) + '</b><span>riebalai, g</span></div></div>'
      + '<div class="portion num"><label for="calcG">Kiekis</label><input type="number" id="calcG" min="1" max="5000" value="' + r.grams + '"> ' + u + ' = <b id="calcPortion"></b></div>'
      + '<div class="fit num" id="calcFit"></div>'
      + (r.tip ? '<div class="tip">' + esc(r.tip) + '</div>' : '')
      + '<div class="btns"><button type="button" class="btn2 main" id="calcAdd">Pridėti į dienoraštį</button><button type="button" class="btn2" id="calcCmp">Į palyginimą</button></div></div>';
    updatePortion();
  }
  function updatePortion() {
    const r = state.cres; const el = document.getElementById('calcPortion'); if (!r || !el) return;
    const f = r.grams / 100;
    el.textContent = nf.format(r.per100.kcal * f) + ' kcal, ' + nf1.format(r.per100.protein * f) + ' g baltymų';
    const t = tot(state.view), left = dayLimit(state.settings, t.burned) - t.kcal;
    $('#calcFit').textContent = left <= 0 ? 'Šios dienos limitas jau išnaudotas.'
      : 'Šiai dienai liko ' + nf.format(left) + ' kcal' + (r.per100.kcal > 0 ? ': tiek kalorijų sudarytų apie ' + nf.format(left / r.per100.kcal * 100) + ' ' + r.unit + ' šio produkto.' : '.');
  }
  function renderCmp() {
    const out = $('#cmpOut');
    if (!state.cmp.length) { out.innerHTML = ''; return; }
    const rows = state.cmp.slice().sort((a, b) => pPer100kcal(b) - pPer100kcal(a));
    out.innerHTML = '<div class="cmp"><div class="cmphead"><h2>Palyginimas</h2><button type="button" id="cmpClear">Išvalyti</button></div>'
      + '<div class="cmpwrap"><table class="num"><thead><tr><th>Produktas</th><th>kcal/100</th><th>baltymai/100</th><th>baltymų 100 kcal</th><th></th></tr></thead><tbody>'
      + rows.map((r, i) => '<tr class="' + (i === 0 && rows.length > 1 ? 'best' : '') + '"><td>' + esc(r.name) + '</td><td>' + nf.format(r.per100.kcal) + '</td><td>' + nf1.format(r.per100.protein) + ' g</td><td>' + nf1.format(pPer100kcal(r)) + ' g</td><td><button type="button" data-cmp-del="' + esc(r.id) + '" aria-label="Pašalinti">×</button></td></tr>').join('')
      + '</tbody></table></div><div class="hint">Surikiuota pagal tai, kiek baltymų gauni už 100 kcal. Metant svorį, kuo daugiau, tuo geriau.</div></div>';
  }
  $('#calcForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.cbusy) return;
    const text = inp('#calcName').value.trim(), gr = Math.round(parseFloat(inp('#calcGrams').value)) || 0, file = state.cfile;
    if (!text && !file) { inp('#calcName').focus(); return; }
    state.cbusy = true; setStatus(file ? 'Skaitau etiketę… tai gali užtrukti iki minutės.' : 'Ieškau…'); render();
    try {
      if (text && !file && isMealPlan(text)) {
        const items = await ai.estimate(text, null);
        state.plan = items.map((it, i) => ({ ...it, key: 'm' + i }));
        state.cres = null; state.cbusy = false; setStatus('');
        render(); renderPlan();
      } else {
        const res = await ai.lookup(text, gr > 0 && gr <= 5000 ? gr : 0, await image(file));
        state.cres = { ...res, id: newId() }; state.plan = null; state.cbusy = false; setStatus('');
        inp('#calcName').value = ''; inp('#calcGrams').value = ''; state.cfile = null; inp('#calcPhoto').value = '';
        render(); renderCalc();
      }
    } catch (err) {
      state.cbusy = false;
      setStatus((err as { code?: string })?.code === 'nofood' ? 'Neatpažinau produkto. Parašyk konkrečiau arba nufotografuok etiketę.' : aiErr(err), true);
      render();
    }
  });
  function renderPlan() {
    const m = state.plan, out = $('#calcOut'); if (!m) return;
    if (!m.length) { state.plan = null; out.innerHTML = ''; return; }
    const sum = m.reduce((a, i) => ({ kcal: a.kcal + (+i.kcal || 0), protein: a.protein + (+i.protein || 0) }), { kcal: 0, protein: 0 });
    const g = state.settings, t = tot(state.view), limit = dayLimit(g, t.burned);
    const leftAfter = limit - t.kcal - sum.kcal, protAfter = g.protein - t.protein - sum.protein;
    const share = limit ? sum.kcal / limit * 100 : 0;
    const chip = leftAfter >= 0 ? '<span class="chip ok num">Telpa</span>' : '<span class="chip over num">Viršytų ' + nf.format(-leftAfter) + '</span>';
    out.innerHTML = '<div class="rescard"><div class="reshead"><div><div class="resname">Valgio planas</div><div class="a">' + (state.view === today() ? 'šiandienai' : dateFmt.format(parseD(state.view))) + '</div></div>' + chip + '</div>'
      + '<ul class="mealitems">' + m.map((it, i) => '<li><div><div class="n">' + esc(it.name) + '</div>' + (it.amount ? '<div class="a">' + esc(it.amount) + '</div>' : '') + maybeHtml(it, it.key) + '</div><div class="kc num">' + nf.format(+it.kcal || 0) + ' kcal<small>' + nf1.format(+it.protein || 0) + ' g baltymų</small></div><button type="button" data-meal-del="' + i + '" aria-label="Pašalinti iš plano" title="Pašalinti iš plano">×</button></li>').join('') + '</ul>'
      + '<div class="g4 num mealsum"><div><b>' + nf.format(sum.kcal) + ' kcal</b><span>valgis iš viso (' + nf.format(share) + ' % dienos)</span></div><div><b>' + nf1.format(sum.protein) + ' g</b><span>baltymų</span></div>'
      + '<div><b>' + (leftAfter >= 0 ? nf.format(leftAfter) : '−' + nf.format(-leftAfter)) + ' kcal</b><span>' + (leftAfter >= 0 ? 'liktų dienai' : 'viršytum dienos limitą') + '</span></div>'
      + '<div><b>' + (protAfter > 0 ? nf.format(protAfter) + ' g' : '✓') + '</b><span>' + (protAfter > 0 ? 'baltymų dar trūktų' : 'baltymų tikslas pasiektas') + '</span></div></div>'
      + '<div class="hint">Nori pakeisti kiekius? Pataisyk tekstą viršuje ir spausk „Tikrinti“ dar kartą, arba pašalink produktą (×).</div>'
      + '<div class="btns"><button type="button" class="btn2 main" id="mealAdd">Pridėti į dienoraštį</button><button type="button" class="btn2" id="mealClear">Uždaryti</button></div></div>';
  }
  $('#calcOut').addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const m = state.plan;
    if (m) {
      const d = t.closest<HTMLElement>('[data-meal-del]');
      if (d) { m.splice(+d.dataset.mealDel!, 1); renderPlan(); return; }
      const my = t.closest<HTMLElement>('[data-mb-yes]');
      if (my) { const i = m.findIndex((x) => x.key === my.dataset.mbYes); const patch = i >= 0 && applyProduct(m[i]); if (patch) { m[i] = { ...m[i], ...patch }; renderPlan(); } return; }
      const mn = t.closest<HTMLElement>('[data-mb-no]');
      if (mn) { const i = m.findIndex((x) => x.key === mn.dataset.mbNo); if (i >= 0) m[i] = { ...m[i], maybe: null, units: null }; renderPlan(); return; }
      if (t.id === 'mealAdd') {
        const now = Date.now();
        const items = m.map((it, i) => toFood(it, { t: now + i, source: 'calc', productId: (it as { productId?: string }).productId ?? null }));
        const sum = items.reduce((a, i) => a + i.kcal, 0);
        state.plan = null; $('#calcOut').innerHTML = ''; inp('#calcName').value = '';
        addFood(items);
        setStatus('Pridėta į dienoraštį: ' + items.length + ' produktai (' + nf.format(sum) + ' kcal) → ' + mealLabel(curSlot()));
        return;
      }
      if (t.id === 'mealClear') { state.plan = null; $('#calcOut').innerHTML = ''; return; }
    }
    const r = state.cres; if (!r) return;
    if (t.id === 'calcAdd') {
      const f = r.grams / 100;
      addFood([{
        id: newId(), name: r.name, amount: r.grams + ' ' + r.unit, kcal: Math.round(r.per100.kcal * f), protein: r1(r.per100.protein * f), carbs: r1(r.per100.carbs * f), fat: r1(r.per100.fat * f),
        t: Date.now(), meal: curSlot(), source: 'calc',
      }]);
      setStatus('Pridėta į dienoraštį: ' + r.name + ' (' + r.grams + ' ' + r.unit + ')'); updatePortion();
    }
    if (t.id === 'calcCmp') {
      if (!state.cmp.some((c) => c.id === r.id)) { state.cmp = state.cmp.concat([{ id: r.id, name: r.name, unit: r.unit, per100: r.per100 }]).slice(-12); saveCmp(); renderCmp(); }
      setStatus('Pridėta į palyginimą.');
    }
  });
  $('#calcOut').addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id !== 'calcG' || !state.cres) return;
    const g = Math.round(parseFloat(t.value)); if (!(g > 0 && g <= 5000)) return;
    state.cres.grams = g; updatePortion();
  });
  $('#cmpOut').addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.id === 'cmpClear') { state.cmp = []; saveCmp(); renderCmp(); return; }
    const d = t.closest<HTMLElement>('[data-cmp-del]'); if (d) { state.cmp = state.cmp.filter((c) => c.id !== d.dataset.cmpDel); saveCmp(); renderCmp(); }
  });
  inp('#calcPhoto').addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement; state.cfile = el.files?.[0] || null;
    if (state.cfile) setStatus('Nuotrauka pasirinkta. Spausk „Tikrinti“.'); render();
  });
  $('#calcFileClear').onclick = () => { state.cfile = null; inp('#calcPhoto').value = ''; render(); };

  /* ---------- lengvesni produktai ---------- */
  function shopLinks(q: string) {
    const e = encodeURIComponent(q);
    return '<a href="https://barbora.lt/paieska?q=' + e + '" target="_blank" rel="noopener">Maxima (Barbora) ↗</a>'
      + '<a href="https://www.rimi.lt/e-parduotuve/lt/paieska?query=' + e + '" target="_blank" rel="noopener">Rimi ↗</a>'
      + '<a href="https://www.lidl.lt/q/search?q=' + e + '" target="_blank" rel="noopener">Lidl ↗</a>';
  }
  function renderAlt() {
    const out = $('#altOut'), r = state.alt, btn = $<HTMLButtonElement>('#altBtn');
    btn.disabled = state.altBusy; btn.textContent = state.altBusy ? 'Ieškau…' : 'Siūlyti';
    if (state.altBusy) { out.innerHTML = '<div class="hint">Claude ieško lengvesnių variantų… tai gali užtrukti iki pusės minutės.</div>'; return; }
    if (!r) { out.innerHTML = ''; return; }
    let h = '';
    if (r.usual && r.usual.kcal) h += '<div class="usual num">Palyginimui: ' + esc(r.usual.name || 'įprastas produktas') + ' ~' + nf.format(r.usual.kcal) + ' kcal / 100 g</div>';
    h += '<ul class="alts">' + r.items.map((it, i) => '<li><div class="top"><span class="nm">' + esc(it.name) + '</span><span class="kc2 num">' + nf.format(it.kcal) + ' kcal<small> / 100 ' + it.unit + '</small></span></div>'
      + '<div class="why">' + esc(it.why) + (it.protein ? ' · baltymai ' + nf1.format(it.protein) + ' g' : '') + '</div>'
      + (it.homemade ? '' : (!it.sure ? '<div class="unsure">Gali būti, kad šiuo metu neparduodamas. Patikrink parduotuvėje.</div>' : ''))
      + '<div class="acts">' + (it.homemade ? '' : shopLinks(it.search)) + '<button type="button" data-alt-cmp="' + i + '">Į palyginimą</button>' + (it.homemade ? '' : '<button type="button" data-alt-check="' + i + '">Tikrinti</button>') + '</div></li>').join('') + '</ul>'
      + '<div class="hint">Kalorijos apytikslės, pagal Claude žinias. Tikslius skaičius rasi etiketėje arba prekės kortelėje parduotuvėje.</div>';
    out.innerHTML = h;
  }
  $('#altForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = inp('#altQ').value.trim(); if (!q || state.altBusy) return;
    state.altBusy = true; renderAlt();
    try {
      state.alt = await ai.alternatives(q);
      state.altBusy = false; renderAlt();
    } catch (err) {
      state.altBusy = false; renderAlt();
      setStatus((err as { code?: string })?.code === 'nofood' ? 'Nepavyko rasti pasiūlymų. Parašyk konkretesnį produktą.' : aiErr(err), true);
    }
  });
  $('#altOut').addEventListener('click', (e) => {
    const t = e.target as HTMLElement, r = state.alt; if (!r) return;
    const c = t.closest<HTMLElement>('[data-alt-cmp]');
    if (c) {
      const it = r.items[+c.dataset.altCmp!]; if (!it) return;
      if (!state.cmp.some((x) => x.name === it.name)) { state.cmp = state.cmp.concat([{ id: newId(), name: it.name, unit: it.unit, per100: { kcal: it.kcal, protein: it.protein, carbs: 0, sugar: 0, fat: 0 } }]).slice(-12); saveCmp(); renderCmp(); }
      setStatus('Pridėta į palyginimą: ' + it.name); return;
    }
    const k = t.closest<HTMLElement>('[data-alt-check]');
    if (k) {
      const it = r.items[+k.dataset.altCheck!]; if (!it) return;
      inp('#calcName').value = it.name; $<HTMLFormElement>('#calcForm').requestSubmit();
      window.scrollTo({ top: $('#calcSec').offsetTop - 10, behavior: 'smooth' });
    }
  });

  /* ---------- skilčių perjungimas ir nuotraukos ---------- */
  function setKind(k: Kind) {
    if (state.busy || state.cbusy) return;
    state.kind = k; setStatus(''); render();
    (k === 'sport' ? inp('#sportMin') : k === 'calc' ? inp('#calcName') : inp('#foodInput')).focus();
  }
  $('#kindFood').onclick = () => setKind('food');
  $('#kindSport').onclick = () => setKind('sport');
  $('#kindCalc').onclick = () => setKind('calc');
  inp('#photoInput').addEventListener('change', (e) => {
    state.file = (e.target as HTMLInputElement).files?.[0] || null;
    if (state.file) setStatus('Nuotrauka pasirinkta. Gali pridėti aprašymą, pvz., „~200 g“, ir spausk „Pridėti“.'); render();
  });
  $('#fileClear').onclick = () => { state.file = null; inp('#photoInput').value = ''; render(); };

  /* ---------- tikslai ---------- */
  let goalT: ReturnType<typeof setTimeout> | undefined;
  function goalChange() {
    clearTimeout(goalT);
    goalT = setTimeout(() => {
      const k = parseInt(inp('#goalKcal').value, 10), p = parseInt(inp('#goalProt').value, 10), w = r1(parseFloat(inp('#goalWeight').value));
      const a = parseInt(inp('#goalAge').value, 10), h = parseInt(inp('#goalHeight').value, 10);
      if (!(k >= 800 && k <= 6000) || !(p >= 20 && p <= 400) || !(w >= 30 && w <= 300) || !(a >= 14 && a <= 100) || !(h >= 120 && h <= 230)) return;
      const s = state.settings;
      if (k === s.kcal && p === s.protein && w === s.weight && a === s.age && h === s.height) return;
      state.settings = { ...s, kcal: k, protein: p, weight: w, age: a, height: h }; render(); persistSettings();
    }, 600);
  }
  for (const id of ['#goalKcal', '#goalProt', '#goalWeight', '#goalAge', '#goalHeight']) inp(id).addEventListener('input', goalChange);
  $<HTMLSelectElement>('#goalSex').addEventListener('change', (e) => { state.settings = { ...state.settings, sex: (e.target as HTMLSelectElement).value === 'f' ? 'f' : 'm' }; render(); persistSettings(); });
  inp('#accurate').addEventListener('change', (e) => { const on = (e.target as HTMLInputElement).checked; state.settings = { ...state.settings, accurate: on }; render(); persistSettings(); setStatus(on ? 'Įjungtas tikslesnis skaičiavimas.' : 'Grąžintas greitas skaičiavimas.'); });
  inp('#addBurned').addEventListener('change', (e) => { state.settings = { ...state.settings, addBurned: (e.target as HTMLInputElement).checked }; render(); persistSettings(); });

  /* ---------- Mano produktai ir Dažni valgiai ---------- */
  function stripItem(i: FoodItem | MealItem): MealItem {
    return { name: i.name, amount: i.amount || '', kcal: +i.kcal || 0, protein: +i.protein || 0, carbs: +i.carbs || 0, fat: +i.fat || 0 };
  }
  function addMealItems(items: MealItem[], label: string) {
    const now = Date.now();
    addFood(items.map((it, i) => toFood(stripItem(it), { t: now + i, source: 'meal', maybe: null, units: null })));
    setStatus('Pridėta: ' + label + ' (' + nf.format(mealKcal(items)) + ' kcal) → ' + mealLabel(curSlot()));
  }
  function renderMeals() {
    const ms = state.meals, v = state.view, slot = curSlot();
    let chips = '';
    const mine = dayItems(v).filter((i) => mealOf(i) === slot), yd = dayItems(addDays(v, -1)).filter((i) => mealOf(i) === slot);
    if (!mine.length && yd.length) chips += '<button type="button" class="yday" data-yday>↻ Kaip vakar: ' + esc(mealLabel(slot)) + '<small class="num">' + nf.format(mealKcal(yd)) + ' kcal</small></button>';
    chips += ms.map((m) => '<button type="button" data-ml="' + esc(m.id) + '">' + esc(m.name) + '<small class="num">' + nf.format(mealKcal(m.items)) + ' kcal</small></button>').join('');
    $('#mlChips').innerHTML = chips || '<span class="hint">Išsaugok valgį iš dienoraščio mygtuku „☆ Išsaugoti“, ir jis atsiras čia.</span>';
    $('#mlList').innerHTML = ms.map((m) => '<li><span>' + esc(m.name) + ' <small class="num">· ' + m.items.map((i) => esc(i.name)).join(', ') + ' = ' + nf.format(mealKcal(m.items)) + ' kcal</small></span><button type="button" data-ml-del="' + esc(m.id) + '" aria-label="Ištrinti valgį">×</button></li>').join('');
  }
  function renderProds() {
    renderMeals();
    const ps = state.products;
    $('#mpChips').innerHTML = ps.length ? ps.map((p) => '<button type="button" data-mp="' + esc(p.id) + '" aria-pressed="' + (state.mpSel === p.id) + '">' + esc(p.name) + '<small class="num">' + nf.format(p.kcal) + ' kcal/' + esc(p.unit) + '</small></button>').join('')
      : '<span class="hint">Dar nėra produktų. Spausk „Tvarkyti“ ir pridėk.</span>';
    $('#mpManage').textContent = state.mpManage ? 'Uždaryti' : 'Tvarkyti';
    $('#mpManageBox').hidden = !state.mpManage;
    $('#mpList').innerHTML = ps.map((p) => '<li><span>' + esc(p.name) + ' <small class="num">· ' + (/^\d/.test(p.unit) ? '' : '1 ') + esc(p.unit) + (p.grams ? ' (' + nf1.format(p.grams) + ' g)' : '') + ' = ' + nf1.format(p.kcal) + ' kcal, ' + nf1.format(p.protein || 0) + ' g baltymų</small></span><button type="button" data-mp-del="' + esc(p.id) + '" aria-label="Ištrinti produktą">×</button></li>').join('');
    const sel = ps.find((p) => p.id === state.mpSel), q = $('#mpQty');
    if (!sel) { q.innerHTML = ''; delete q.dataset.id; return; }
    if (!q.querySelector('#mpN') || q.dataset.id !== sel.id) {
      q.dataset.id = sel.id;
      q.innerHTML = '<div class="mpqty"><b>' + esc(sel.name) + '</b><span class="stp"><button type="button" data-mp-step="-1" aria-label="Mažiau">−</button><input type="number" id="mpN" value="1" min="0.25" step="0.25" aria-label="Kiekis"><button type="button" data-mp-step="1" aria-label="Daugiau">+</button></span><span>' + esc(sel.unit) + '</span>'
        + (gramsPer(sel) ? '<span>arba</span><input type="number" class="gin" id="mpG" min="1" max="5000" step="1" inputmode="numeric" aria-label="Kiekis gramais" value="' + Math.round(gramsPer(sel)) + '"><span>g</span>' : '')
        + '<span class="tot num" id="mpTot"></span><button type="button" class="btn2 main" id="mpAddBtn">Pridėti</button><button type="button" class="btn2" id="mpCancel">Atšaukti</button></div>';
    }
    mpUpdate();
  }
  const selProduct = () => state.products.find((p) => p.id === state.mpSel);
  function mpUpdate() {
    const sel = selProduct(), n = parseFloat((document.getElementById('mpN') as HTMLInputElement | null)?.value || '') || 0;
    const tEl = document.getElementById('mpTot');
    if (sel && tEl) tEl.textContent = '= ' + nf.format(sel.kcal * n) + ' kcal, ' + nf1.format((sel.protein || 0) * n) + ' g baltymų';
  }
  $('#mpChips').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-mp]'); if (!b) return;
    const id = b.dataset.mp!; state.mpSel = state.mpSel === id ? null : id; renderProds();
    const n = document.getElementById('mpN') as HTMLInputElement | null; if (n) { n.focus(); n.select(); }
  });
  $('#mpQty').addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement, sel = selProduct(), gp = sel ? gramsPer(sel) : 0;
    const mpG = document.getElementById('mpG') as HTMLInputElement | null, mpN = document.getElementById('mpN') as HTMLInputElement;
    if (t.id === 'mpN') { if (gp && mpG) mpG.value = String(Math.round((parseFloat(t.value) || 0) * gp)); mpUpdate(); }
    if (t.id === 'mpG' && gp) { mpN.value = String(Math.round((parseFloat(t.value) || 0) / gp * 100) / 100); mpUpdate(); }
  });
  $('#mpQty').addEventListener('click', (e) => {
    const t = e.target as HTMLElement, sel = selProduct();
    const mpN = document.getElementById('mpN') as HTMLInputElement | null, mpG = document.getElementById('mpG') as HTMLInputElement | null;
    const st = t.closest<HTMLElement>('[data-mp-step]');
    if (st && mpN) { mpN.value = String(Math.max(0.25, (parseFloat(mpN.value) || 0) + +st.dataset.mpStep!)); if (sel && gramsPer(sel) && mpG) mpG.value = String(Math.round(parseFloat(mpN.value) * gramsPer(sel))); mpUpdate(); return; }
    if (t.id === 'mpCancel') { state.mpSel = null; renderProds(); return; }
    if (t.id === 'mpAddBtn' && sel && mpN) {
      const n = parseFloat(mpN.value); if (!(n > 0 && n <= 100)) return;
      const nn = Math.round(n * 100) / 100, gp = gramsPer(sel);
      addFood([{
        id: newId(), name: sel.name,
        amount: isGramUnit(sel) ? nf.format(gp * nn) + ' ' + (/ml$/i.test(sel.unit) ? 'ml' : 'g') : nf1.format(nn) + ' × ' + sel.unit + (gp ? ' (' + nf.format(gp * nn) + ' g)' : ''),
        kcal: Math.round(sel.kcal * nn), protein: r1((sel.protein || 0) * nn), carbs: r1((sel.carbs || 0) * nn), fat: r1((sel.fat || 0) * nn),
        t: Date.now(), meal: curSlot(), productId: sel.id, source: 'product',
      }]);
      setStatus('Pridėta: ' + sel.name + ' (' + nf.format(sel.kcal * nn) + ' kcal) → ' + mealLabel(curSlot()));
      state.mpSel = null; renderProds();
    }
  });
  $('#mlChips').addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-yday]')) { const slot = curSlot(); const yd = dayItems(addDays(state.view, -1)).filter((i) => mealOf(i) === slot); if (yd.length) addMealItems(yd.map(stripItem), 'kaip vakar'); return; }
    const b = t.closest<HTMLElement>('[data-ml]'); if (!b) return;
    const m = state.meals.find((x) => x.id === b.dataset.ml); if (m) addMealItems(m.items, m.name);
  });
  $('#mlList').addEventListener('click', (e) => {
    const d = (e.target as HTMLElement).closest<HTMLElement>('[data-ml-del]'); if (!d) return;
    const id = d.dataset.mlDel!; state.meals = state.meals.filter((m) => m.id !== id); renderProds(); save(() => store.deleteMeal(id));
  });
  $('#mpManage').onclick = () => { state.mpManage = !state.mpManage; renderProds(); };
  $('#mpList').addEventListener('click', (e) => {
    const d = (e.target as HTMLElement).closest<HTMLElement>('[data-mp-del]'); if (!d) return;
    const id = d.dataset.mpDel!;
    state.products = state.products.filter((p) => p.id !== id); if (state.mpSel === id) state.mpSel = null;
    renderProds(); save(() => store.deleteProduct(id));
  });
  $('#mpForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = inp('#mpName').value.trim(), unit = inp('#mpUnit').value.trim(), k = parseFloat(inp('#mpKcal').value);
    if (!name || !unit || !(k >= 0)) return;
    if (state.products.length >= 100) { setStatus('Daugiausia 100 produktų. Ištrink nereikalingus.', true); return; }
    const g = parseFloat(inp('#mpGrams').value), pr = parseFloat(inp('#mpProt').value);
    const p: Product = { id: newId(), name: name.slice(0, 80), unit: unit.slice(0, 30), grams: g > 0 ? r1(g) : 0, kcal: r1(k), protein: pr > 0 ? r1(pr) : 0, carbs: 0, fat: 0 };
    state.products = state.products.concat([p]);
    $<HTMLFormElement>('#mpForm').reset(); renderProds(); save(() => store.addProduct(p)); setStatus('Produktas pridėtas: ' + name);
  });

  /* ---------- statistika ---------- */
  function renderStats() {
    const n = state.statsN, td = today(), g = state.settings;
    document.querySelectorAll<HTMLElement>('.stats .seg button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.n! === n)));
    const all = periodDays(n).map((d) => dayStat(d, state.days[d], g));
    const done = all.filter((x) => x.logged && x.d !== td);
    const tiles = $('#statTiles');
    if (state.loading) tiles.innerHTML = '';
    else if (!done.length) {
      tiles.innerHTML = '<div class="tile" style="grid-column:1/-1"><span>Statistika atsiras, kai turėsi bent vieną pilnai užpildytą dieną (šiandiena įskaičiuojama nuo rytojaus).</span></div>';
    } else {
      const avg = (f: (x: typeof done[number]) => number) => done.reduce((a, x) => a + f(x), 0) / done.length;
      const sumBal = done.reduce((a, x) => a + x.bal, 0), kg = -sumBal / KCAL_PER_KG_FAT;
      const inGoal = done.filter((x) => x.kcal <= dayLimit(g, x.burned)).length;
      const stepDays = all.filter((x) => x.steps > 0), wk = all.reduce((a, x) => a + x.workouts, 0);
      const avgBal = avg((x) => x.bal);
      const T = (label: string, val: string, cls = '', sub = '') => '<div class="tile"><span>' + label + '</span><b class="' + cls + '">' + val + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
      tiles.innerHTML =
        T('Vid. suvalgyta', nf.format(avg((x) => x.kcal)) + ' kcal')
        + T('Vid. sudeginta', nf.format(avg((x) => x.out)) + ' kcal')
        + T(avgBal <= 0 ? 'Vid. deficitas' : 'Vid. perteklius', nf.format(Math.abs(avgBal)) + ' kcal', avgBal <= 0 ? 'def' : 'sur', 'per dieną')
        + T(kg >= 0 ? '≈ riebalų numesta' : '≈ riebalų priaugta', nf1.format(Math.abs(kg)) + ' kg', kg >= 0 ? 'def' : 'sur', 'pagal deficitą (7700 kcal = 1 kg)')
        + T('Vid. baltymai', nf.format(avg((x) => x.protein)) + ' g', avg((x) => x.protein) >= g.protein * 0.9 ? 'def' : '', 'tikslas ' + nf.format(g.protein) + ' g')
        + T('Dienos tikslo ribose', inGoal + ' iš ' + done.length)
        + T('Treniruotės', String(wk), '', wk ? 'per ' + n + ' d.' : '')
        + T('Vid. žingsniai', stepDays.length ? nf.format(stepDays.reduce((a, x) => a + x.steps, 0) / stepDays.length) : '–', '', stepDays.length ? stepDays.length + ' d. su įrašu' : '');
    }
    // balanso grafikas
    const W = 336, mid = 68, half = 48, slot = W / n, bw = Math.max(4, slot * 0.62);
    const maxAbs = Math.max(500, ...all.filter((x) => x.logged).map((x) => Math.abs(x.bal)));
    let sv = '<line x1="0" x2="' + W + '" y1="' + mid + '" y2="' + mid + '" stroke="var(--line)" stroke-width="1"/>'
      + '<text x="2" y="12" font-size="9.5" fill="var(--muted)">perteklius</text><text x="2" y="' + (mid + half + 12) + '" font-size="9.5" fill="var(--muted)">deficitas</text>';
    all.forEach((x, i) => {
      const cx = slot * i + slot / 2;
      sv += '<g class="barhit" data-day="' + x.d + '"><rect x="' + (slot * i) + '" y="0" width="' + slot + '" height="150" fill="transparent"/>';
      if (x.logged) {
        const h = Math.max(2, Math.abs(x.bal) / maxAbs * half), y = x.bal > 0 ? mid - h : mid;
        sv += '<rect x="' + (cx - bw / 2) + '" y="' + y + '" width="' + bw + '" height="' + h + '" rx="' + Math.min(4, bw / 3) + '" fill="' + (x.bal > 0 ? 'var(--over)' : 'var(--ok)') + '" opacity="' + (x.d === td ? 0.45 : (x.d === state.view ? 1 : 0.8)) + '"/>';
        if (n <= 7) sv += '<text x="' + cx + '" y="' + (x.bal > 0 ? y - 4 : y + h + 11) + '" text-anchor="middle" font-size="9.5" fill="var(--muted)">' + (x.bal > 0 ? '+' : '−') + nf.format(Math.abs(x.bal)) + '</text>';
      }
      const lab = n <= 7 ? wdFmt.format(parseD(x.d)).replace('.', '') : ((i % 5 === 4 || i === n - 1) ? String(parseD(x.d).getDate()) : '');
      if (lab) sv += '<text x="' + cx + '" y="146" text-anchor="middle" font-size="10.5" fill="' + (x.d === state.view ? 'var(--fg)' : 'var(--muted)') + '" font-weight="' + (x.d === state.view ? 700 : 400) + '">' + esc(lab) + '</text>';
      sv += '</g>';
    });
    $('#balSvg').innerHTML = sv;
    $('#statSub').textContent = 'Kiekvienos dienos balansas: suvalgyta minus sudeginta (natūraliai + sportas + žingsniai). Šiandiena rodoma blyškiau, nes dar nesibaigė. Paspaudęs stulpelį atidarysi tą dieną.';
    // daugiausiai kalorijų davę produktai
    const agg: Record<string, { name: string; kcal: number; c: number }> = {};
    for (const x of all) for (const it of dayItems(x.d)) {
      const k = String(it.name || '').toLowerCase(); if (!k) continue;
      agg[k] ||= { name: it.name, kcal: 0, c: 0 }; agg[k].kcal += +it.kcal || 0; agg[k].c++;
    }
    const top = Object.values(agg).sort((a, b) => b.kcal - a.kcal).slice(0, 5);
    $('#topFoods').innerHTML = top.length ? '<h2 style="margin-bottom:6px">Daugiausiai kalorijų davė</h2><ul class="topf num">'
      + top.map((f) => '<li><span>' + esc(f.name) + '</span><span>' + f.c + '× · ' + nf.format(f.kcal) + ' kcal</span></li>').join('') + '</ul>' : '';
    // pastebėjimai
    const ins = state.insight;
    $('#insightTxt').textContent = state.insightLive != null ? state.insightLive : (ins ? ins.text : '');
    $('#insightMeta').textContent = (state.insightLive == null && ins && ins.at) ? 'Sugeneruota ' + stampFmt.format(new Date(ins.at)) + ' · ' + (ins.n || 7) + ' d. laikotarpis' : '';
    const ib = $<HTMLButtonElement>('#insightBtn');
    ib.disabled = state.insightBusy;
    ib.textContent = state.insightBusy ? 'Claude galvoja…' : (ins ? 'Atnaujinti pastebėjimus' : 'Gauti pastebėjimus');
  }
  $('.stats .seg').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-n]');
    if (b) { state.statsN = +b.dataset.n!; renderStats(); }
  });
  $('#balSvg').addEventListener('click', (e) => {
    const g = (e.target as Element).closest('[data-day]'); if (g) goDay(g.getAttribute('data-day')!);
  });

  /** Laikotarpio suvestinė tekstu pastebėjimams. */
  function insightLines(n: number): string {
    const td = today(), g = state.settings;
    return periodDays(n).map((d) => dayStat(d, state.days[d], g)).filter((x) => x.logged || x.steps || x.workouts).map((x) => {
      const foods = dayItems(x.d).slice().sort((a, b) => (a.t || 0) - (b.t || 0)).slice(0, 30)
        .map((it) => (it.t ? timeFmt.format(new Date(it.t)) + ' ' : '') + it.name + (it.amount ? ' (' + it.amount + ')' : '') + ' ' + Math.round(+it.kcal || 0) + ' kcal/' + Math.round(+it.protein || 0) + ' g b.').join('; ');
      return x.d + ' ' + wdFmt.format(parseD(x.d)) + (x.d === td ? ' (šiandien, diena nebaigta)' : '')
        + ' | suvalgyta ' + x.kcal + ' kcal, baltymai ' + Math.round(x.protein) + ' g | sportas ' + dayEx(x.d).map((e) => e.amount || '').join(', ') + ' (' + x.burned + ' kcal su žingsniais) | žingsniai ' + x.steps
        + ' | balansas ' + (x.bal > 0 ? '+' : '') + x.bal + ' kcal | maistas: ' + (foods || '–');
    }).join('\n');
  }
  $('#insightBtn').addEventListener('click', async () => {
    if (state.insightBusy) return;
    const n = state.statsN, lines = insightLines(n);
    if (!lines) { setStatus('Pirmiausia įrašyk bent vienos dienos maistą.', true); return; }
    state.insightBusy = true; state.insightLive = 'Claude peržiūri tavo įrašus…'; renderStats();
    try {
      const text = await ai.insight(n, lines);
      const ins: Insight = { text: text.trim(), at: Date.now(), n };
      state.insight = ins; state.insightBusy = false; state.insightLive = null; renderStats();
      save(() => store.saveInsight(ins));
    } catch (err) {
      state.insightBusy = false; state.insightLive = null; renderStats();
      toast(aiErr(err));
    }
  });

  /* ---------- paskyra ---------- */
  $('#mockBar').hidden = !ctx.mock;
  $('#logoutBtn').hidden = ctx.mock;
  $('#logoutBtn').onclick = () => ctx.onLogout();
  $('#foot').textContent = 'Kalorijos įvertinamos apytiksliai. Tiksliausia nurodyti gramus, pvz., „150 g virtų ryžių“.';

  /* ---------- paleidimas ---------- */
  // Jei programa atidaryta per vidurnaktį – „šiandien“ persijungia.
  let lastToday = today();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const t = today();
    if (t !== lastToday) { if (state.view === lastToday) state.view = t; lastToday = t; }
    void queue.then(reload);
  });

  const data = await store.loadInitial(state.loadedFrom);
  Object.assign(state, { days: data.days, settings: data.settings, products: data.products, meals: data.meals, insight: data.insight, loading: false });
  render();
}

