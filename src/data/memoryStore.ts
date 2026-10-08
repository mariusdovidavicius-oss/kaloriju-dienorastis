import { DEFAULT_SETTINGS } from '../lib/calc';
import { addDays, today } from '../lib/dates';
import type { Day, FoodItem, Insight, Product, SavedMeal, Settings, Workout } from '../types';
import { emptyDay, type InitialData, type Store } from './store';

/** Bandomoji saugykla atmintyje (režimas `npm run dev:mock` ir testai). Po puslapio perkrovimo viskas dingsta. */
export class MemoryStore implements Store {
  settings: Settings = { ...DEFAULT_SETTINGS, weight: 94, height: 183, age: 36, kcal: 2000, protein: 160, onboarded: true };
  products: Product[] = [
    { id: 'p-duona', name: 'Vilniaus ruginė duona (pilno grūdo)', unit: 'riekė', grams: 33, kcal: 78, protein: 2.7, carbs: 14.5, fat: 0.3 },
    { id: 'p-majonezas', name: "Hellmann's Light majonezas", unit: 'šaukštas', grams: 15, kcal: 43, protein: 0.1, carbs: 1.4, fat: 4.1 },
  ];
  meals: SavedMeal[] = [];
  insight: Insight | null = null;
  days: Record<string, Day> = {};
  /** Testams: kiek kartų kviesta kiekviena operacija. */
  calls: string[] = [];

  constructor(seed = true, onboarded = true) {
    this.settings.onboarded = onboarded;
    if (seed) {
      const y = addDays(today(), -1);
      const t = Date.now() - 86400000;
      this.days[y] = {
        date: y, steps: 7000,
        items: [
          { id: 'seed-1', name: 'Avižinė košė', amount: '250 g', kcal: 180, protein: 6, carbs: 30, fat: 3.5, t: t - 10 * 3600e3, meal: 'pusryciai' },
          { id: 'seed-2', name: 'Vištienos krūtinėlė', amount: '200 g', kcal: 330, protein: 62, carbs: 0, fat: 7, t: t - 5 * 3600e3, meal: 'pietus' },
        ],
        ex: [{ id: 'seed-w', name: 'Treniruotė', amount: '40 min', minutes: 40, kcal: 219, t: t - 3 * 3600e3 }],
      };
    }
  }

  private day(d: string) { return (this.days[d] ||= emptyDay(d)); }
  private findFood(id: string) { for (const d of Object.values(this.days)) { const i = d.items.findIndex((x) => x.id === id); if (i >= 0) return { d, i }; } return null; }
  private findWk(id: string) { for (const d of Object.values(this.days)) { const i = d.ex.findIndex((x) => x.id === id); if (i >= 0) return { d, i }; } return null; }
  private clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }

  async loadInitial(from: string): Promise<InitialData> {
    this.calls.push('loadInitial');
    return this.clone({ settings: this.settings, products: this.products, meals: this.meals, insight: this.insight, days: await this.loadRange(from, '9999-12-31') });
  }
  async loadRange(from: string, to: string) {
    const out: Record<string, Day> = {};
    for (const [k, v] of Object.entries(this.days)) if (k >= from && k <= to) out[k] = this.clone(v);
    return out;
  }
  async addFood(date: string, items: FoodItem[]) { this.calls.push('addFood'); this.day(date).items.push(...this.clone(items)); }
  async updateFood(id: string, patch: Partial<FoodItem>) { this.calls.push('updateFood'); const f = this.findFood(id); if (f) f.d.items[f.i] = { ...f.d.items[f.i], ...patch }; }
  async deleteFood(id: string) { this.calls.push('deleteFood'); const f = this.findFood(id); if (f) f.d.items.splice(f.i, 1); }
  async addWorkout(date: string, w: Workout) { this.calls.push('addWorkout'); this.day(date).ex.push({ ...w }); }
  async updateWorkout(id: string, patch: Partial<Workout>) { this.calls.push('updateWorkout'); const f = this.findWk(id); if (f) f.d.ex[f.i] = { ...f.d.ex[f.i], ...patch }; }
  async deleteWorkout(id: string) { this.calls.push('deleteWorkout'); const f = this.findWk(id); if (f) f.d.ex.splice(f.i, 1); }
  async setSteps(date: string, steps: number) { this.calls.push('setSteps'); this.day(date).steps = steps; }
  async saveSettings(s: Settings) { this.calls.push('saveSettings'); this.settings = { ...s }; }
  async addProduct(p: Product) { this.calls.push('addProduct'); this.products.push({ ...p }); }
  async deleteProduct(id: string) { this.calls.push('deleteProduct'); this.products = this.products.filter((p) => p.id !== id); }
  async addMeal(m: SavedMeal) { this.calls.push('addMeal'); this.meals.push(this.clone(m)); }
  async deleteMeal(id: string) { this.calls.push('deleteMeal'); this.meals = this.meals.filter((m) => m.id !== id); }
  async saveInsight(i: Insight) { this.calls.push('saveInsight'); this.insight = { ...i }; }
}
