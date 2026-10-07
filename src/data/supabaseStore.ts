import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_SETTINGS } from '../lib/calc';
import type { Day, FoodItem, Insight, MealKey, Product, SavedMeal, Settings, Workout } from '../types';
import { emptyDay, type InitialData, type Store } from './store';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code || 'db' });
  return res.data;
}

/* ---------- DB eilutė ⇄ programos objektas ---------- */
function rowToFood(r: Row): FoodItem {
  return {
    id: r.id, name: r.name, amount: r.amount || '', kcal: num(r.kcal), protein: num(r.protein), carbs: num(r.carbs), fat: num(r.fat),
    t: Date.parse(r.eaten_at), meal: r.meal as MealKey, productId: r.product_id, maybe: r.maybe_product_id,
    units: r.maybe_units == null ? null : num(r.maybe_units), source: r.source,
  };
}
function foodToRow(date: string | null, it: Partial<FoodItem>): Row {
  const r: Row = {};
  if (date) r.day = date;
  if (it.id !== undefined) r.id = it.id;
  if (it.name !== undefined) r.name = it.name;
  if (it.amount !== undefined) r.amount = it.amount;
  if (it.kcal !== undefined) r.kcal = Math.round(it.kcal);
  if (it.protein !== undefined) r.protein = it.protein;
  if (it.carbs !== undefined) r.carbs = it.carbs;
  if (it.fat !== undefined) r.fat = it.fat;
  if (it.t !== undefined) r.eaten_at = new Date(it.t).toISOString();
  if (it.meal !== undefined) r.meal = it.meal;
  if (it.productId !== undefined) r.product_id = it.productId;
  if (it.maybe !== undefined) r.maybe_product_id = it.maybe;
  if (it.units !== undefined) r.maybe_units = it.units;
  if (it.source !== undefined) r.source = it.source;
  return r;
}
function rowToWorkout(r: Row): Workout {
  return { id: r.id, name: r.name, amount: r.amount || '', minutes: r.minutes, kcal: num(r.kcal), t: Date.parse(r.logged_at) };
}
function workoutToRow(date: string | null, w: Partial<Workout>): Row {
  const r: Row = {};
  if (date) r.day = date;
  if (w.id !== undefined) r.id = w.id;
  if (w.name !== undefined) r.name = w.name;
  if (w.amount !== undefined) r.amount = w.amount;
  if (w.minutes !== undefined) r.minutes = w.minutes;
  if (w.kcal !== undefined) r.kcal = Math.round(w.kcal);
  if (w.t !== undefined) r.logged_at = new Date(w.t).toISOString();
  return r;
}
function rowToSettings(r: Row | null): Settings {
  if (!r) return { ...DEFAULT_SETTINGS };
  return {
    kcal: num(r.kcal_goal) || DEFAULT_SETTINGS.kcal, protein: num(r.protein_goal) || DEFAULT_SETTINGS.protein,
    weight: num(r.weight_kg) || DEFAULT_SETTINGS.weight, age: num(r.age) || DEFAULT_SETTINGS.age,
    height: num(r.height_cm) || DEFAULT_SETTINGS.height, sex: r.sex === 'f' ? 'f' : 'm',
    addBurned: !!r.add_burned, accurate: !!r.accurate,
  };
}
function rowToProduct(r: Row): Product {
  return { id: r.id, name: r.name, unit: r.unit, grams: num(r.grams), kcal: num(r.kcal), protein: num(r.protein), carbs: num(r.carbs), fat: num(r.fat) };
}

export class SupabaseStore implements Store {
  constructor(private db: SupabaseClient, private userId: string) {}

  async loadInitial(from: string): Promise<InitialData> {
    const [profile, products, meals, insight, days] = await Promise.all([
      this.db.from('profiles').select('*').eq('id', this.userId).maybeSingle(),
      this.db.from('products').select('*').order('created_at'),
      this.db.from('saved_meals').select('id,name,created_at,saved_meal_items(position,name,amount,kcal,protein,carbs,fat)').order('created_at'),
      this.db.from('insights').select('text,period_days,created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      this.loadRange(from, '9999-12-31'),
    ]);
    const ins = check(insight) as Row | null;
    return {
      settings: rowToSettings(check(profile) as Row | null),
      products: (check(products) as Row[]).map(rowToProduct),
      meals: (check(meals) as Row[]).map((m) => ({
        id: m.id, name: m.name,
        items: ((m.saved_meal_items || []) as Row[]).sort((a, b) => a.position - b.position)
          .map((i) => ({ name: i.name, amount: i.amount || '', kcal: num(i.kcal), protein: num(i.protein), carbs: num(i.carbs), fat: num(i.fat) })),
      })),
      insight: ins ? { text: ins.text, at: Date.parse(ins.created_at), n: num(ins.period_days) } : null,
      days,
    };
  }

  async loadRange(from: string, to: string): Promise<Record<string, Day>> {
    const [food, wk, steps] = await Promise.all([
      this.db.from('food_entries').select('*').gte('day', from).lte('day', to).order('eaten_at').limit(5000),
      this.db.from('workouts').select('*').gte('day', from).lte('day', to).order('logged_at').limit(2000),
      this.db.from('daily_steps').select('day,steps').gte('day', from).lte('day', to),
    ]);
    const days: Record<string, Day> = {};
    const get = (d: string) => (days[d] ||= emptyDay(d));
    for (const r of check(food) as Row[]) get(r.day).items.push(rowToFood(r));
    for (const r of check(wk) as Row[]) get(r.day).ex.push(rowToWorkout(r));
    for (const r of check(steps) as Row[]) get(r.day).steps = num(r.steps);
    return days;
  }

  async addFood(date: string, items: FoodItem[]) {
    if (!items.length) return;
    check(await this.db.from('food_entries').insert(items.map((i) => foodToRow(date, i))));
  }
  async updateFood(id: string, patch: Partial<FoodItem>) {
    check(await this.db.from('food_entries').update(foodToRow(null, patch)).eq('id', id));
  }
  async deleteFood(id: string) {
    check(await this.db.from('food_entries').delete().eq('id', id));
  }

  async addWorkout(date: string, w: Workout) {
    check(await this.db.from('workouts').insert(workoutToRow(date, w)));
  }
  async updateWorkout(id: string, patch: Partial<Workout>) {
    check(await this.db.from('workouts').update(workoutToRow(null, patch)).eq('id', id));
  }
  async deleteWorkout(id: string) {
    check(await this.db.from('workouts').delete().eq('id', id));
  }

  async setSteps(date: string, steps: number) {
    if (steps > 0) check(await this.db.from('daily_steps').upsert({ user_id: this.userId, day: date, steps }, { onConflict: 'user_id,day' }));
    else check(await this.db.from('daily_steps').delete().eq('day', date));
  }

  async saveSettings(s: Settings) {
    check(await this.db.from('profiles').update({
      kcal_goal: s.kcal, protein_goal: s.protein, weight_kg: s.weight, age: s.age, height_cm: s.height,
      sex: s.sex, add_burned: s.addBurned, accurate: s.accurate,
    }).eq('id', this.userId));
  }

  async addProduct(p: Product) {
    check(await this.db.from('products').insert({
      id: p.id, name: p.name, unit: p.unit, grams: p.grams || null, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat,
    }));
  }
  async deleteProduct(id: string) {
    check(await this.db.from('products').delete().eq('id', id));
  }

  async addMeal(m: SavedMeal) {
    check(await this.db.from('saved_meals').insert({ id: m.id, name: m.name }));
    const res = await this.db.from('saved_meal_items').insert(m.items.map((i, position) => ({
      meal_id: m.id, position, name: i.name, amount: i.amount, kcal: Math.round(i.kcal), protein: i.protein, carbs: i.carbs, fat: i.fat,
    })));
    if (res.error) { await this.db.from('saved_meals').delete().eq('id', m.id); check(res); }
  }
  async deleteMeal(id: string) {
    check(await this.db.from('saved_meals').delete().eq('id', id));
  }

  async saveInsight(i: Insight) {
    check(await this.db.from('insights').insert({ text: i.text, period_days: i.n, created_at: new Date(i.at).toISOString() }));
  }
}
