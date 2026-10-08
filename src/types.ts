export type MealKey = 'pusryciai' | 'pietus' | 'vakariene' | 'uzkandis';
export type Sex = 'm' | 'f';
export type Activity = 'low' | 'light' | 'mid';

export interface Settings {
  kcal: number;
  protein: number;
  weight: number;
  age: number;
  height: number;
  sex: Sex;
  addBurned: boolean;
  accurate: boolean;
  /** Ar pirmo paleidimo vedlys jau užbaigtas. */
  onboarded: boolean;
  lang: 'lt' | 'en';
  activity: Activity;
  /** Norimas tempas, kg per savaitę (0 – išlaikyti). */
  pace: number;
  /** Tikslo svoris, kg (nebūtina). */
  goalWeight: number | null;
}

/** Svorio įrašas (vienas per dieną). */
export interface WeightEntry { date: string; kg: number }

export type EntrySource = 'ai' | 'manual' | 'product' | 'meal' | 'calc' | 'import';

/** Maisto įrašas dienoraštyje. */
export interface FoodItem {
  id: string;
  name: string;
  amount: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Valgymo laikas, ms nuo 1970 m. */
  t: number;
  meal: MealKey;
  productId?: string | null;
  /** „Gal tai …?“ – pasiūlytas Mano produktas ir vienetų skaičius. */
  maybe?: string | null;
  units?: number | null;
  source?: EntrySource;
}

/** Treniruotė ar kita fizinė veikla. */
export interface Workout {
  id: string;
  name: string;
  amount: string;
  minutes?: number | null;
  kcal: number;
  t: number;
}

export interface Day {
  date: string;
  items: FoodItem[];
  ex: Workout[];
  steps: number;
}

export interface Product {
  id: string;
  name: string;
  unit: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealItem {
  name: string;
  amount: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface SavedMeal {
  id: string;
  name: string;
  items: MealItem[];
}

export interface Insight {
  text: string;
  at: number;
  n: number;
}

/** AI įvertinimas prieš įrašant (be id/laiko/valgio). */
export interface EstimatedItem extends MealItem {
  maybe?: string | null;
  units?: number | null;
}

export interface LookupResult {
  name: string;
  unit: 'g' | 'ml';
  per100: { kcal: number; protein: number; carbs: number; sugar: number; fat: number };
  portionDesc: string;
  grams: number;
  tip: string;
}

export interface Alternative {
  name: string;
  search: string;
  kcal: number;
  protein: number;
  unit: 'g' | 'ml';
  why: string;
  sure: boolean;
  homemade: boolean;
}

export interface AlternativesResult {
  usual: { name: string; kcal: number } | null;
  items: Alternative[];
}

export interface ImageInput {
  mediaType: string;
  data: string; // base64 be „data:“ priešdėlio
  name: string;
}
