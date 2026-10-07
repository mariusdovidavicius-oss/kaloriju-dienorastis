import type { AlternativesResult, EstimatedItem, ImageInput, LookupResult } from '../types';
import { AiError, type AiClient } from './client';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Netikras AI bandomajam režimui ir testams. */
export class MockAi implements AiClient {
  calls: { task: string; text: string; image: boolean }[] = [];

  async estimate(text: string, image?: ImageInput | null): Promise<EstimatedItem[]> {
    this.calls.push({ task: 'estimate', text, image: !!image });
    await wait(150);
    if (/akmuo|plyta/i.test(text)) throw new AiError('nofood');
    const parts = text.split(/,(?!\d)|\sir\s|[;+\n]/i).map((s) => s.trim()).filter(Boolean);
    return (parts.length ? parts : ['Maistas iš nuotraukos']).map((p) => {
      const isMayo = /majonez/i.test(p);
      return {
        name: p.charAt(0).toUpperCase() + p.slice(1).replace(/\s*\(.*$/, ''), amount: '1 porcija',
        kcal: isMayo ? 100 : 200, protein: 10, carbs: 20, fat: 5,
        maybe: isMayo ? 'p-majonezas' : null, units: isMayo ? 1 : null,
      };
    });
  }

  async lookup(text: string, grams: number, image?: ImageInput | null): Promise<LookupResult> {
    this.calls.push({ task: 'lookup', text, image: !!image });
    await wait(100);
    return {
      name: text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Produktas iš etiketės', unit: 'g',
      per100: { kcal: 73, protein: 9, carbs: 4, sugar: 4, fat: 2 }, portionDesc: '1 indelis', grams: grams || 150,
      tip: 'Geras pasirinkimas: daug baltymų, mažai kalorijų.',
    };
  }

  async alternatives(q: string): Promise<AlternativesResult> {
    this.calls.push({ task: 'alternatives', text: q, image: false });
    await wait(100);
    return {
      usual: { name: 'Įprastas ' + q, kcal: 680 },
      items: [
        { name: q + ' light', search: q + ' light', kcal: 289, protein: 0.5, unit: 'g', why: 'Perpus mažiau kalorijų', sure: true, homemade: false },
        { name: 'Naminis ' + q + ' su jogurtu', search: '', kcal: 120, protein: 5, unit: 'g', why: 'Daug mažiau riebalų', sure: true, homemade: true },
      ],
    };
  }

  async insight(n: number, lines: string): Promise<string> {
    this.calls.push({ task: 'insight', text: lines, image: false });
    await wait(100);
    return `• Bandomasis pastebėjimas (${n} d.).\n• Baltymų pakanka.`;
  }
}
