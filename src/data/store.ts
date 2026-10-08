import type { Day, FoodItem, Insight, Product, SavedMeal, Settings, WeightEntry, Workout } from '../types';

export interface InitialData {
  settings: Settings;
  products: Product[];
  meals: SavedMeal[];
  insight: Insight | null;
  days: Record<string, Day>;
  /** Visi svorio įrašai, seniausi pirmi. */
  weights: WeightEntry[];
}

/**
 * Duomenų sluoksnis. Tikroji versija – Supabase (supabaseStore.ts),
 * bandomoji – atmintyje (memoryStore.ts), kad testai neliestų tikrų duomenų.
 */
export interface Store {
  /** Nustatymai, produktai, valgiai, pastebėjimai ir dienos nuo `from` (imtinai). */
  loadInitial(from: string): Promise<InitialData>;
  /** Dienos intervale [from, to]. */
  loadRange(from: string, to: string): Promise<Record<string, Day>>;

  addFood(date: string, items: FoodItem[]): Promise<void>;
  updateFood(id: string, patch: Partial<FoodItem>): Promise<void>;
  deleteFood(id: string): Promise<void>;

  addWorkout(date: string, w: Workout): Promise<void>;
  updateWorkout(id: string, patch: Partial<Workout>): Promise<void>;
  deleteWorkout(id: string): Promise<void>;

  /** 0 – ištrina dienos žingsnius. */
  setSteps(date: string, steps: number): Promise<void>;

  saveSettings(s: Settings): Promise<void>;

  addProduct(p: Product): Promise<void>;
  deleteProduct(id: string): Promise<void>;

  addMeal(m: SavedMeal): Promise<void>;
  deleteMeal(id: string): Promise<void>;

  saveInsight(i: Insight): Promise<void>;

  /** null – ištrina tos dienos svorį. */
  setWeight(date: string, kg: number | null): Promise<void>;
}

export function emptyDay(date: string): Day {
  return { date, items: [], ex: [], steps: 0 };
}
