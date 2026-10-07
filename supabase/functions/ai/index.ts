// Serverio funkcija Claude užklausoms.
// Claude API raktas laikomas tik čia (Supabase paslaptis ANTHROPIC_API_KEY), naršyklė jo nemato.
//
// Užklausa (POST, su prisijungusio vartotojo JWT):
//   { task: 'estimate' | 'lookup' | 'alternatives' | 'insight', text?, grams?, image?: {mediaType, data}, n?, lines? }
// Atsakymas: išvalytas JSON arba { error: '<kodas>' }.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { alternativesPrompt, estimatePrompt, insightPrompt, lookupPrompt, type Product, type Profile } from './prompts.ts';

const MODEL_QUICK = Deno.env.get('AI_MODEL_QUICK') ?? 'claude-haiku-4-5-20251001';
const MODEL_DEFAULT = Deno.env.get('AI_MODEL_DEFAULT') ?? 'claude-sonnet-5-5';
const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? '150');
const MAX_IMAGE_B64 = 5_000_000; // ~3,7 MB
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (code: string, status = 400) => json({ error: code }, status);

const n = (v: unknown) => { const f = parseFloat(String(v)); return Number.isFinite(f) && f >= 0 ? f : 0; };
const r1 = (x: number) => Math.round(x * 10) / 10;
const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

/** Ištraukia pirmą JSON objektą iš modelio atsakymo. */
function parseJson(text: string): unknown {
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s < 0 || e <= s) throw new Error('parse');
  return JSON.parse(text.slice(s, e + 1));
}

interface Usage { input_tokens: number; output_tokens: number }

async function claude(model: string, prompt: string, image: { mediaType: string; data: string } | null, maxTokens: number) {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) throw Object.assign(new Error('not_configured'), { code: 'not_configured' });
  const content: unknown[] = [];
  if (image) content.push({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } });
  content.push({ type: 'text', text: prompt });
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('anthropic', res.status, body.slice(0, 500));
    const code = res.status === 429 || res.status === 529 ? 'busy' : res.status === 400 && image ? 'image_rejected' : 'upstream';
    throw Object.assign(new Error(code), { code });
  }
  const data = await res.json();
  const text = (data.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('');
  return { text, usage: (data.usage ?? { input_tokens: 0, output_tokens: 0 }) as Usage };
}

/* ---------- atsakymų valymas ---------- */
function cleanItems(raw: unknown, productIds: Set<string>) {
  const r = raw as { items?: unknown };
  const arr = Array.isArray(raw) ? raw : Array.isArray(r?.items) ? r.items : null;
  if (!arr) throw Object.assign(new Error('parse'), { code: 'parse' });
  return arr.map((x) => {
    if (!x || typeof x !== 'object') return null;
    const o = x as Record<string, unknown>;
    const name = str(o.name, 80);
    if (!name) return null;
    const maybe = typeof o.maybe === 'string' && productIds.has(o.maybe) ? o.maybe : null;
    return {
      name, amount: str(o.amount, 60), kcal: Math.round(n(o.kcal)), protein: r1(n(o.protein)), carbs: r1(n(o.carbs)), fat: r1(n(o.fat)),
      maybe, units: maybe ? (n(o.units) || 1) : null,
    };
  }).filter(Boolean);
}

function cleanLookup(raw: unknown, grams: number) {
  const r = raw as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!r || typeof r !== 'object' || !str(r.name, 80)) throw Object.assign(new Error('nofood'), { code: 'nofood' });
  const p = r.per100 || {};
  return {
    name: str(r.name, 80), unit: r.unit === 'ml' ? 'ml' : 'g',
    per100: { kcal: Math.round(n(p.kcal)), protein: r1(n(p.protein)), carbs: r1(n(p.carbs)), sugar: r1(n(p.sugar)), fat: r1(n(p.fat)) },
    portionDesc: str(r.portion?.desc, 40), tip: str(r.tip, 240),
    grams: grams || Math.round(n(r.portion?.grams)) || 100,
  };
}

function cleanAlternatives(raw: unknown) {
  const r = raw as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const items = (r && Array.isArray(r.items) ? r.items : []).map((x: any) => x && typeof x === 'object' ? { // eslint-disable-line @typescript-eslint/no-explicit-any
    name: str(x.name, 80), search: str(x.search || x.name, 60).replace(/%/g, '').trim(),
    kcal: Math.round(n(x.kcal)), protein: r1(n(x.protein)), unit: x.unit === 'ml' ? 'ml' : 'g',
    why: str(x.why, 120), sure: x.sure !== false, homemade: !!x.homemade,
  } : null).filter((x: { name: string } | null) => x && x.name).slice(0, 6);
  if (!items.length) throw Object.assign(new Error('nofood'), { code: 'nofood' });
  const usual = r.usual && typeof r.usual === 'object' ? { name: str(r.usual.name, 60), kcal: Math.round(n(r.usual.kcal)) } : null;
  return { usual, items };
}

/* ---------- pagrindinė funkcija ---------- */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('bad_request', 405);

  const auth = req.headers.get('Authorization') ?? '';
  const url = Deno.env.get('SUPABASE_URL')!;
  const userDb = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: userData } = await userDb.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
  const user = userData?.user;
  if (!user) return fail('session_expired', 401);

  let body: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { body = await req.json(); } catch { return fail('bad_request'); }
  const task = String(body.task || '');
  if (!['estimate', 'lookup', 'alternatives', 'insight'].includes(task)) return fail('bad_request');

  // dienos limitas vienam vartotojui
  const since = new Date(Date.now() - 24 * 3600e3).toISOString();
  const { count } = await admin.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', since);
  if ((count ?? 0) >= DAILY_LIMIT) return fail('daily_limit', 429);

  // paveikslėlis
  let image: { mediaType: string; data: string } | null = null;
  if (body.image && typeof body.image === 'object') {
    const mt = String(body.image.mediaType || ''), data = String(body.image.data || '');
    if (!IMAGE_TYPES.includes(mt) || !data || data.length > MAX_IMAGE_B64) return fail('image_rejected');
    image = { mediaType: mt, data };
  }

  const [{ data: profile }, { data: products }] = await Promise.all([
    userDb.from('profiles').select('kcal_goal,protein_goal,weight_kg,age,height_cm,sex,accurate').eq('id', user.id).single(),
    userDb.from('products').select('id,name,unit,grams,kcal,protein,carbs,fat').order('created_at'),
  ]);
  const prof = profile as Profile | null;
  const prods = (products ?? []) as Product[];
  const text = str(body.text, 1000);
  const tierModel = (image || prof?.accurate) ? MODEL_DEFAULT : MODEL_QUICK;

  let model = tierModel;
  let usage: Usage = { input_tokens: 0, output_tokens: 0 };
  const log = (ok: boolean) => admin.from('ai_usage').insert({ user_id: user.id, task, model, input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, ok });

  try {
    let result: unknown;
    if (task === 'estimate') {
      if (!text && !image) return fail('bad_request');
      const out = await claude(model, estimatePrompt(text, !!image, prods), image, 1500);
      usage = out.usage;
      const items = cleanItems(parseJson(out.text), new Set(prods.map((p) => p.id)));
      if (!items.length) throw Object.assign(new Error('nofood'), { code: 'nofood' });
      result = { items };
    } else if (task === 'lookup') {
      if (!text && !image) return fail('bad_request');
      const g = Math.round(n(body.grams));
      const out = await claude(model, lookupPrompt(text, !!image, prods), image, 800);
      usage = out.usage;
      result = cleanLookup(parseJson(out.text), g > 0 && g <= 5000 ? g : 0);
    } else if (task === 'alternatives') {
      if (!text) return fail('bad_request');
      model = MODEL_DEFAULT;
      const out = await claude(model, alternativesPrompt(text), null, 1500);
      usage = out.usage;
      result = cleanAlternatives(parseJson(out.text));
    } else {
      if (!prof) return fail('bad_request');
      const lines = str(body.lines, 12000);
      const days = Math.min(90, Math.max(1, Math.round(n(body.n)) || 7));
      if (!lines) return fail('bad_request');
      model = MODEL_DEFAULT;
      const out = await claude(model, insightPrompt(prof, days, lines), null, 700);
      usage = out.usage;
      result = { text: out.text.trim() };
    }
    await log(true);
    return json(result);
  } catch (e) {
    const code = (e as { code?: string }).code ?? (e instanceof SyntaxError || (e as Error).message === 'parse' ? 'parse' : 'upstream');
    if (code !== 'not_configured') await log(false);
    if (code !== 'nofood' && code !== 'parse') console.error(task, code, (e as Error).message);
    return fail(code, code === 'not_configured' ? 503 : code === 'busy' ? 503 : 422);
  }
});
