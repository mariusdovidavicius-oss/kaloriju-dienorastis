import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlternativesResult, EstimatedItem, ImageInput, LookupResult } from '../types';
import { AiError, type AiClient } from './client';

/** Kviečia serverio funkciją `ai` (supabase/functions/ai). Claude API raktas yra tik serveryje. */
export class SupabaseAi implements AiClient {
  constructor(private db: SupabaseClient) {}

  private async call<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.db.functions.invoke('ai', { body });
    if (error) {
      // FunctionsHttpError turi atsakymą su { error: kodas }
      let code = 'network';
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        try { const j = await ctx.json(); if (j && typeof j.error === 'string') code = j.error; } catch { /* ne JSON */ }
      }
      throw new AiError(code);
    }
    if (data && typeof data === 'object' && 'error' in data) throw new AiError(String((data as { error: unknown }).error));
    return data as T;
  }

  async estimate(text: string, image?: ImageInput | null) {
    const r = await this.call<{ items: EstimatedItem[] }>({ task: 'estimate', text, image: image || undefined });
    return r.items;
  }
  lookup(text: string, grams: number, image?: ImageInput | null) {
    return this.call<LookupResult>({ task: 'lookup', text, grams, image: image || undefined });
  }
  alternatives(q: string) {
    return this.call<AlternativesResult>({ task: 'alternatives', text: q });
  }
  async insight(n: number, lines: string) {
    const r = await this.call<{ text: string }>({ task: 'insight', n, lines });
    return r.text;
  }
}
