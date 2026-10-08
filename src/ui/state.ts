// Programos būsena ir veiksmai. Ekranai (views/*) tik piešia ir kviečia šiuos veiksmus.
import type { AiClient } from '../ai/client';
import { emptyDay, type Store } from '../data/store';
import { t, type Key } from '../i18n';
import { slotByHour, totals } from '../lib/calc';
import { addDays, today } from '../lib/dates';
import type { Day, FoodItem, Insight, MealKey, Product, SavedMeal, Settings, WeightEntry, Workout } from '../types';
import { toast } from './dom';

const LOAD_DAYS = 120;

export type Tab = 'today' | 'stats' | 'profile';

export class AppState {
  loading = true;
  days: Record<string, Day> = {};
  loadedFrom = addDays(today(), -LOAD_DAYS);
  settings!: Settings;
  products: Product[] = [];
  meals: SavedMeal[] = [];
  insight: Insight | null = null;
  weights: WeightEntry[] = [];
  view = today();
  tab: Tab = 'today';
  statsN = 7;

  private queue: Promise<unknown> = Promise.resolve();
  private listeners: (() => void)[] = [];

  constructor(public store: Store, public ai: AiClient) {}

  /** Užregistruoja piešimo funkciją; `changed()` ją iškviečia. */
  subscribe(f: () => void) { this.listeners.push(f); }
  changed() { this.listeners.forEach((f) => f()); }

  /* ---------- įkėlimas ir saugojimas ---------- */
  async load() {
    const data = await this.store.loadInitial(this.loadedFrom);
    Object.assign(this, { days: data.days, settings: data.settings, products: data.products, meals: data.meals, insight: data.insight, weights: data.weights, loading: false });
  }
  async reload() {
    try { await this.load(); this.changed(); } catch (e) { console.error(e); }
  }
  /** Visi įrašymai vykdomi eilės tvarka; klaidos atveju duomenys perkraunami. */
  save(fn: () => Promise<unknown>) {
    this.queue = this.queue.then(fn).catch((e) => {
      console.error(e);
      toast(t('saveFailed'));
      void this.reload();
    });
    return this.queue;
  }
  afterSaves() { return this.queue; }

  async ensureLoaded(date: string) {
    if (date >= this.loadedFrom) return;
    const from = addDays(date, -30), to = addDays(this.loadedFrom, -1);
    try {
      const more = await this.store.loadRange(from, to);
      this.days = { ...more, ...this.days };
      this.loadedFrom = from;
      this.changed();
    } catch { toast(t('olderFailed')); }
  }

  /* ---------- dienos duomenys ---------- */
  day(d: string): Day { return this.days[d] || emptyDay(d); }
  totals(d: string) { return totals(this.days[d], this.settings); }
  private setDay(d: string, patch: Partial<Day>) { this.days = { ...this.days, [d]: { ...this.day(d), ...patch } }; }
  defaultMeal(): MealKey { return slotByHour(new Date().getHours()); }

  goDay(d: string) {
    if (d > today()) return;
    this.view = d;
    this.changed();
    void this.ensureLoaded(addDays(d, -1));
  }

  addFood(items: FoodItem[], date = this.view) {
    if (!items.length) return;
    this.setDay(date, { items: this.day(date).items.concat(items) });
    this.changed();
    void this.save(() => this.store.addFood(date, items));
  }
  updateFood(id: string, patch: Partial<FoodItem>) {
    const d = this.view;
    this.setDay(d, { items: this.day(d).items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
    this.changed();
    void this.save(() => this.store.updateFood(id, patch));
  }
  /** Ištrina ir parodo „Atšaukti“. */
  deleteFood(id: string) {
    const d = this.view, it = this.day(d).items.find((i) => i.id === id);
    if (!it) return;
    this.setDay(d, { items: this.day(d).items.filter((i) => i.id !== id) });
    this.changed();
    void this.save(() => this.store.deleteFood(id));
    toast(t('deleted', { what: it.name }), { label: t('undo'), run: () => this.addFood([it], d) });
  }
  addWorkout(w: Workout) {
    const d = this.view;
    this.setDay(d, { ex: this.day(d).ex.concat([w]) });
    this.changed();
    void this.save(() => this.store.addWorkout(d, w));
  }
  updateWorkout(id: string, patch: Partial<Workout>) {
    const d = this.view;
    this.setDay(d, { ex: this.day(d).ex.map((w) => (w.id === id ? { ...w, ...patch } : w)) });
    this.changed();
    void this.save(() => this.store.updateWorkout(id, patch));
  }
  deleteWorkout(id: string) {
    const d = this.view, w = this.day(d).ex.find((x) => x.id === id);
    if (!w) return;
    this.setDay(d, { ex: this.day(d).ex.filter((x) => x.id !== id) });
    this.changed();
    void this.save(() => this.store.deleteWorkout(id));
    toast(t('deleted', { what: w.name }), { label: t('undo'), run: () => this.addWorkoutTo(d, w) });
  }
  private addWorkoutTo(d: string, w: Workout) {
    this.setDay(d, { ex: this.day(d).ex.concat([w]) });
    this.changed();
    void this.save(() => this.store.addWorkout(d, w));
  }
  setSteps(steps: number) {
    const d = this.view, before = this.day(d).steps;
    this.setDay(d, { steps });
    this.changed();
    void this.save(() => this.store.setSteps(d, steps));
    if (!steps && before) toast(t('deleted', { what: t('steps') }), { label: t('undo'), run: () => this.setSteps(before) });
  }

  /** Vanduo: pakeičia dienos kiekį (ml) per `delta`. */
  addWater(delta: number, date = this.view) {
    const cur = this.day(date).water || 0, ml = Math.max(0, Math.min(20000, cur + delta));
    if (ml === cur) return;
    this.setDay(date, { water: ml });
    this.changed();
    void this.save(() => this.store.setWater(date, ml));
  }

  /** Nukopijuoja įrašus į kitą dieną (`meal` – į kitą valgį, jei nurodyta). */
  copyFood(items: FoodItem[], date: string, meal?: MealKey) {
    if (!items.length || date > today()) return;
    const now = Date.now();
    this.addFood(items.map((it, i) => ({ ...it, id: crypto.randomUUID(), t: now + i, meal: meal ?? it.meal, maybe: null, units: null })), date);
  }

  /** Receptas ar dažnas valgis pakeičiamas nauju (tas pats id lieka). */
  replaceMeal(m: SavedMeal) {
    this.meals = this.meals.map((x) => (x.id === m.id ? m : x));
    this.changed();
    void this.save(async () => { await this.store.deleteMeal(m.id); await this.store.addMeal(m); });
  }
  recipes(): SavedMeal[] { return this.meals.filter((m) => m.servings != null); }
  savedMeals(): SavedMeal[] { return this.meals.filter((m) => m.servings == null); }

  saveSettings(s: Settings) {
    this.settings = s;
    this.changed();
    void this.save(() => this.store.saveSettings(s));
  }
  addProduct(p: Product) {
    this.products = this.products.concat([p]);
    this.changed();
    void this.save(() => this.store.addProduct(p));
  }
  deleteProduct(id: string) {
    this.products = this.products.filter((p) => p.id !== id);
    this.changed();
    void this.save(() => this.store.deleteProduct(id));
  }
  addMeal(m: SavedMeal) {
    this.meals = this.meals.concat([m]);
    this.changed();
    void this.save(() => this.store.addMeal(m));
  }
  deleteMeal(id: string) {
    this.meals = this.meals.filter((m) => m.id !== id);
    this.changed();
    void this.save(() => this.store.deleteMeal(id));
  }
  setInsight(i: Insight) {
    this.insight = i;
    this.changed();
    void this.save(() => this.store.saveInsight(i));
  }

  /** Svoris dienai (null – ištrinti). Naujausias svoris tampa profilio svoriu (BMR skaičiavimui). */
  setWeight(date: string, kg: number | null) {
    const before = this.weights.find((w) => w.date === date);
    this.weights = this.weights.filter((w) => w.date !== date);
    if (kg != null) this.weights = this.weights.concat([{ date, kg }]).sort((a, b) => (a.date < b.date ? -1 : 1));
    void this.save(() => this.store.setWeight(date, kg));
    const latest = this.weights.at(-1);
    if (latest && latest.kg !== this.settings.weight) this.saveSettings({ ...this.settings, weight: latest.kg });
    else this.changed();
    if (kg == null && before) toast(t('weightDeleted'), { label: t('undo'), run: () => this.setWeight(date, before.kg) });
  }
  latestWeight(): WeightEntry | null { return this.weights.at(-1) ?? null; }

  /** Paskutiniai skirtingi valgyti produktai (naujausi pirmi). */
  recentFoods(limit = 12): FoodItem[] {
    const seen = new Set<string>(), out: FoodItem[] = [];
    const dates = Object.keys(this.days).sort().reverse();
    for (const d of dates) {
      const items = this.days[d].items.slice().sort((a, b) => b.t - a.t);
      for (const it of items) {
        const k = it.name.toLowerCase() + '|' + it.amount;
        if (seen.has(k)) continue;
        seen.add(k); out.push(it);
        if (out.length >= limit) return out;
      }
    }
    return out;
  }
}

/** AI klaidos kodas → pranešimas. */
export function aiErr(e: unknown): string {
  const c = (e as { code?: string })?.code;
  const map: Record<string, Key> = {
    not_configured: 'errNotConfigured', daily_limit: 'errDailyLimit', global_limit: 'errGlobalLimit', busy: 'errBusy',
    image_rejected: 'errImage', session_expired: 'errSession', nofood: 'errNoFood', parse: 'errParse', upstream: 'errParse', network: 'errNetwork',
  };
  return t(c && map[c] ? map[c] : 'errNetwork');
}
