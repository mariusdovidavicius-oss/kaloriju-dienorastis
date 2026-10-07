#!/usr/bin/env node
// Vienkartinis senų duomenų perkėlimas iš claude.ai Artifact versijos į Supabase.
//
// Naudojimas:
//   node scripts/import-artifact.mjs <katalogas su JSON> <vartotojo uuid> > import.sql
// Katalogas – Artifact saugyklos eksportas (day-YYYY-MM-DD.json, products.json, meals.json, settings.json, insight.json).
// Gautą SQL paleisk Supabase SQL redaktoriuje. Asmeninių duomenų į repozitoriją nekelk.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const [dir, userId] = process.argv.slice(2);
if (!dir || !/^[0-9a-f-]{36}$/.test(userId || '')) {
  console.error('Naudojimas: node scripts/import-artifact.mjs <katalogas> <vartotojo uuid>');
  process.exit(1);
}
const read = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const q = (v) => (v === null || v === undefined ? 'null' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
const MEALS = ['pusryciai', 'pietus', 'vakariene', 'uzkandis'];
const slotByHour = (h) => (h < 11 ? 'pusryciai' : h < 16 ? 'pietus' : h < 21 ? 'vakariene' : 'uzkandis');
const vilniusHour = (t) => Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Vilnius' }).format(new Date(t)));

const out = ['begin;'];
const U = q(userId);

// nustatymai
if (existsSync(join(dir, 'settings.json'))) {
  const s = read('settings.json');
  out.push(`update public.profiles set kcal_goal=${num(s.kcal) || 2000}, protein_goal=${num(s.protein) || 160}, weight_kg=${num(s.weight) || 80}, age=${num(s.age) || 35}, height_cm=${num(s.height) || 175}, sex=${q(s.sex === 'f' ? 'f' : 'm')}, add_burned=${!!s.addBurned}, accurate=${!!s.accurate} where id=${U};`);
}

// produktai (seni id → nauji uuid)
const prodMap = {};
if (existsSync(join(dir, 'products.json'))) {
  for (const p of read('products.json').items || []) {
    const id = randomUUID(); prodMap[p.id] = id;
    out.push(`insert into public.products (id,user_id,name,unit,grams,kcal,protein,carbs,fat) values (${q(id)},${U},${q(p.name)},${q(p.unit)},${num(p.grams) || 'null'},${num(p.kcal)},${num(p.protein)},${num(p.carbs)},${num(p.fat)});`);
  }
}

// dažni valgiai
if (existsSync(join(dir, 'meals.json'))) {
  for (const m of read('meals.json').items || []) {
    const id = randomUUID();
    out.push(`insert into public.saved_meals (id,user_id,name) values (${q(id)},${U},${q(String(m.name).slice(0, 40))});`);
    (m.items || []).forEach((i, pos) => out.push(`insert into public.saved_meal_items (meal_id,user_id,position,name,amount,kcal,protein,carbs,fat) values (${q(id)},${U},${pos},${q(i.name)},${q(i.amount || '')},${Math.round(num(i.kcal))},${num(i.protein)},${num(i.carbs)},${num(i.fat)});`));
  }
}

// dienos
let nFood = 0, nWk = 0, nSteps = 0;
for (const f of readdirSync(dir).filter((f) => /^day-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()) {
  const d = read(f), date = d.date;
  for (const it of d.items || []) {
    const t = num(it.t) || Date.parse(date + 'T12:00:00Z');
    const meal = MEALS.includes(it.meal) ? it.meal : slotByHour(vilniusHour(t));
    const maybe = it.maybe && prodMap[it.maybe] ? prodMap[it.maybe] : null;
    out.push(`insert into public.food_entries (user_id,day,meal,name,amount,kcal,protein,carbs,fat,eaten_at,maybe_product_id,maybe_units,source) values (${U},${q(date)},${q(meal)},${q(String(it.name).slice(0, 80))},${q(String(it.amount || '').slice(0, 60))},${Math.round(num(it.kcal))},${num(it.protein)},${num(it.carbs)},${num(it.fat)},${q(new Date(t).toISOString())},${q(maybe)},${maybe ? num(it.units) || 1 : 'null'},'import');`);
    nFood++;
  }
  for (const w of d.ex || []) {
    const m = /(\d+)\s*min/.exec(w.amount || '');
    out.push(`insert into public.workouts (user_id,day,name,minutes,amount,kcal,logged_at) values (${U},${q(date)},${q(String(w.name || 'Treniruotė').slice(0, 80))},${m ? Math.min(600, Number(m[1])) : 'null'},${q(w.amount || '')},${Math.round(num(w.kcal))},${q(new Date(num(w.t) || Date.parse(date + 'T12:00:00Z')).toISOString())});`);
    nWk++;
  }
  if (num(d.steps) > 0) { out.push(`insert into public.daily_steps (user_id,day,steps) values (${U},${q(date)},${Math.round(num(d.steps))}) on conflict (user_id,day) do update set steps=excluded.steps;`); nSteps++; }
}

// paskutiniai pastebėjimai
if (existsSync(join(dir, 'insight.json'))) {
  const i = read('insight.json');
  if (i.text) out.push(`insert into public.insights (user_id,period_days,text,created_at) values (${U},${Math.min(90, Math.max(1, num(i.n) || 7))},${q(i.text)},${q(new Date(num(i.at) || Date.now()).toISOString())});`);
}

out.push('commit;');
console.log(out.join('\n'));
console.error(`Produktai: ${Object.keys(prodMap).length}, maisto įrašai: ${nFood}, treniruotės: ${nWk}, žingsnių dienos: ${nSteps}`);
