import type { AlternativesResult, EstimatedItem, ImageInput, LookupResult } from '../types';

export interface AiClient {
  /** Išskaido aprašytą (ar nufotografuotą) maistą į produktus. */
  estimate(text: string, image?: ImageInput | null): Promise<EstimatedItem[]>;
  /** Vieno produkto maistinė vertė 100 g. `grams` – 0, jei nenurodyta. */
  lookup(text: string, grams: number, image?: ImageInput | null): Promise<LookupResult>;
  /** Lengvesnių produktų pasiūlymai. */
  alternatives(q: string): Promise<AlternativesResult>;
  /** Pastebėjimai pagal laikotarpio įrašus (`lines` – suvestinė tekstu). */
  insight(n: number, lines: string): Promise<string>;
}

/** Klaida su kodu, kurį UI paverčia lietuvišku pranešimu (žr. aiErr app.ts). */
export class AiError extends Error {
  constructor(public code: string, message?: string) { super(message || code); }
}
