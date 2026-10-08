// Veikimas be interneto: įrašymai dedami į eilę telefone (localStorage) ir išsiunčiami, kai atsiranda ryšys.
// Paskutiniai įkelti duomenys saugomi kaip kopija, kad programa atsidarytų ir be ryšio.
import type { Day, FoodItem, Insight, Product, PushSub, SavedMeal, Settings, Workout } from '../types';
import { emptyDay, type InitialData, type Store } from './store';

type Method = 'addFood' | 'updateFood' | 'deleteFood' | 'addWorkout' | 'updateWorkout' | 'deleteWorkout' | 'setSteps'
  | 'saveSettings' | 'addProduct' | 'deleteProduct' | 'addMeal' | 'deleteMeal' | 'saveInsight' | 'setWeight' | 'setWater' | 'setPush';
interface Op { m: Method; a: unknown[] }

export interface SyncStatus { offline: boolean; pending: number }

/** Ar klaida – ryšio (o ne serverio atmetimo) klaida. */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = String((e as { message?: string })?.message ?? e);
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|aborted/i.test(msg);
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Pritaiko įrašymą prie duomenų kopijos (naudojama kopijai atnaujinti ir eilei parodyti be ryšio). */
export function applyOp(d: InitialData, op: Op): void {
  const day = (date: string): Day => (d.days[date] ||= emptyDay(date));
  const eachDay = (f: (x: Day) => void) => Object.values(d.days).forEach(f);
  const a = op.a as unknown;
  switch (op.m) {
    case 'addFood': { const [date, items] = a as [string, FoodItem[]]; const x = day(date); x.items = x.items.filter((i) => !items.some((n) => n.id === i.id)).concat(items); break; }
    case 'updateFood': { const [id, patch] = a as [string, Partial<FoodItem>]; eachDay((x) => { x.items = x.items.map((i) => (i.id === id ? { ...i, ...patch } : i)); }); break; }
    case 'deleteFood': { const [id] = a as [string]; eachDay((x) => { x.items = x.items.filter((i) => i.id !== id); }); break; }
    case 'addWorkout': { const [date, w] = a as [string, Workout]; const x = day(date); x.ex = x.ex.filter((i) => i.id !== w.id).concat([w]); break; }
    case 'updateWorkout': { const [id, patch] = a as [string, Partial<Workout>]; eachDay((x) => { x.ex = x.ex.map((i) => (i.id === id ? { ...i, ...patch } : i)); }); break; }
    case 'deleteWorkout': { const [id] = a as [string]; eachDay((x) => { x.ex = x.ex.filter((i) => i.id !== id); }); break; }
    case 'setSteps': { const [date, n] = a as [string, number]; day(date).steps = n; break; }
    case 'setWater': { const [date, n] = a as [string, number]; day(date).water = n; break; }
    case 'setPush': break;
    case 'saveSettings': { d.settings = clone((a as [Settings])[0]); break; }
    case 'addProduct': { const p = (a as [Product])[0]; d.products = d.products.filter((x) => x.id !== p.id).concat([p]); break; }
    case 'deleteProduct': { const id = (a as [string])[0]; d.products = d.products.filter((x) => x.id !== id); break; }
    case 'addMeal': { const m = (a as [SavedMeal])[0]; d.meals = d.meals.filter((x) => x.id !== m.id).concat([m]); break; }
    case 'deleteMeal': { const id = (a as [string])[0]; d.meals = d.meals.filter((x) => x.id !== id); break; }
    case 'saveInsight': { d.insight = clone((a as [Insight])[0]); break; }
    case 'setWeight': {
      const [date, kg] = a as [string, number | null];
      d.weights = d.weights.filter((w) => w.date !== date);
      if (kg != null) d.weights = d.weights.concat([{ date, kg }]).sort((x, y) => (x.date < y.date ? -1 : 1));
      break;
    }
  }
}

export class OfflineStore implements Store {
  private outbox: Op[];
  private flushing: Promise<void> | null = null;
  private offline = false;
  private listeners: ((s: SyncStatus) => void)[] = [];
  /** Kviečiama, kai serveris atmeta įrašymą (ne dėl ryšio). */
  onRejected: (e: unknown) => void = () => {};

  constructor(private inner: Store, private key: string) {
    this.outbox = this.read<Op[]>('outbox') || [];
    if (typeof window !== 'undefined') window.addEventListener('online', () => { void this.flush(); });
  }

  /* ---------- būsena ---------- */
  status(): SyncStatus { return { offline: this.offline, pending: this.outbox.length }; }
  onStatus(f: (s: SyncStatus) => void) { this.listeners.push(f); }
  private emit() { const s = this.status(); this.listeners.forEach((f) => f(s)); }
  private setOffline(v: boolean) { if (this.offline !== v) { this.offline = v; this.emit(); } }

  private read<T>(name: string): T | null {
    try { const v = localStorage.getItem('kd-' + name + '-' + this.key); return v ? JSON.parse(v) as T : null; } catch { return null; }
  }
  private write(name: string, v: unknown) {
    try { localStorage.setItem('kd-' + name + '-' + this.key, JSON.stringify(v)); } catch { /* pilna saugykla – tęsiam be kopijos */ }
  }
  private updateCache(op: Op) {
    const c = this.read<InitialData>('cache'); if (!c) return;
    applyOp(c, op); this.write('cache', c);
  }

  /** Išsiunčia eilę iš eilės. Ryšio klaida – sustoja ir laukia; serverio atmetimas – įrašas pašalinamas. */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      while (this.outbox.length) {
        const op = this.outbox[0];
        try {
          await (this.inner[op.m] as (...x: unknown[]) => Promise<void>)(...op.a);
          this.setOffline(false);
        } catch (e) {
          if (isNetworkError(e)) { this.setOffline(true); break; }
          console.error('Įrašas atmestas', op, e);
          this.onRejected(e);
        }
        this.outbox.shift();
        this.write('outbox', this.outbox);
        this.updateCache(op);
        this.emit();
      }
    })().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  private enqueue(m: Method, a: unknown[]): Promise<void> {
    this.outbox.push({ m, a: clone(a) });
    this.write('outbox', this.outbox);
    this.emit();
    void this.flush();
    return Promise.resolve();
  }

  /* ---------- skaitymas ---------- */
  async loadInitial(from: string): Promise<InitialData> {
    await this.flush();
    try {
      const d = await this.inner.loadInitial(from);
      this.setOffline(false);
      this.write('cache', d);
      const view = clone(d);
      this.outbox.forEach((op) => applyOp(view, op));
      return view;
    } catch (e) {
      const c = this.read<InitialData>('cache');
      if (!isNetworkError(e) || !c) throw e;
      this.setOffline(true);
      this.outbox.forEach((op) => applyOp(c, op));
      return c;
    }
  }
  async loadRange(from: string, to: string): Promise<Record<string, Day>> {
    try { return await this.inner.loadRange(from, to); } catch (e) { if (isNetworkError(e)) { this.setOffline(true); return {}; } throw e; }
  }

  /* ---------- rašymas (per eilę) ---------- */
  addFood(date: string, items: FoodItem[]) { return this.enqueue('addFood', [date, items]); }
  updateFood(id: string, patch: Partial<FoodItem>) { return this.enqueue('updateFood', [id, patch]); }
  deleteFood(id: string) { return this.enqueue('deleteFood', [id]); }
  addWorkout(date: string, w: Workout) { return this.enqueue('addWorkout', [date, w]); }
  updateWorkout(id: string, patch: Partial<Workout>) { return this.enqueue('updateWorkout', [id, patch]); }
  deleteWorkout(id: string) { return this.enqueue('deleteWorkout', [id]); }
  setSteps(date: string, steps: number) { return this.enqueue('setSteps', [date, steps]); }
  saveSettings(s: Settings) { return this.enqueue('saveSettings', [s]); }
  addProduct(p: Product) { return this.enqueue('addProduct', [p]); }
  deleteProduct(id: string) { return this.enqueue('deleteProduct', [id]); }
  addMeal(m: SavedMeal) { return this.enqueue('addMeal', [m]); }
  deleteMeal(id: string) { return this.enqueue('deleteMeal', [id]); }
  saveInsight(i: Insight) { return this.enqueue('saveInsight', [i]); }
  setWeight(date: string, kg: number | null) { return this.enqueue('setWeight', [date, kg]); }
  setWater(date: string, ml: number) { return this.enqueue('setWater', [date, ml]); }
  setPush(sub: PushSub | null, endpoint: string) { return this.enqueue('setPush', [sub, endpoint]); }
}
