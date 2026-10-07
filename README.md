# Kalorijų dienoraštis

Kalorijų ir baltymų dienoraštis lietuviškai. Telefone jį galima įsidiegti kaip programėlę („Pridėti į pagrindinį ekraną“).
Maistą aprašai žodžiais arba nufotografuoji, o Claude jį išskaido į produktus ir paskaičiuoja kalorijas.

## Kaip viskas sujungta

| Dalis | Kur | Kam |
|---|---|---|
| Svetainė | Vercel (statinė, `npm run build` → `dist/`) | Vartotojo sąsaja |
| Duomenų bazė ir prisijungimas | Supabase projektas `kaloriju-dienorastis` (Frankfurtas, ES) | Įrašai, produktai, tikslai |
| AI | Supabase serverio funkcija `ai` → Claude API | Maisto įvertinimas, skaičiuoklė, pastebėjimai |

Claude API raktas yra **tik** Supabase paslaptyse (`ANTHROPIC_API_KEY`), naršyklė jo nemato.
Naršyklėje naudojamas tik viešas „publishable“ raktas; duomenis saugo RLS taisyklės, todėl kiekvienas vartotojas mato tik savo eilutes.

## Katalogai

```
src/
  main.ts              paleidimas: prisijungimas → programa (arba bandomasis režimas)
  ui/app.ts            pagrindinis langas (suvestinė, įvedimas, dienoraštis, statistika)
  ui/auth.ts           prisijungimas, registracija, slaptažodžio atkūrimas
  lib/calc.ts          formulės: BMR, natūralus deginimas, sportas, žingsniai, statistika
  data/store.ts        duomenų sluoksnio sąsaja
  data/supabaseStore.ts   tikroji saugykla (Supabase)
  data/memoryStore.ts     bandomoji saugykla (tik atmintyje)
  ai/supabaseAi.ts     kviečia serverio funkciją `ai`
  ai/mockAi.ts         netikras AI testams
supabase/
  migrations/          duomenų bazės schema (taikoma eilės tvarka)
  functions/ai/        serverio funkcija ir Claude nurodymai (prompts.ts)
tests/                 formulių testai (Vitest)
e2e/                   naršyklės testai bandomajame režime (Playwright)
scripts/import-artifact.mjs   senų Artifact duomenų perkėlimas
```

## Komandos

```bash
npm install
npm run dev        # programa su tikra Supabase duomenų baze
npm run dev:mock   # bandomasis režimas: duomenys atmintyje, AI netikras
npm test           # formulių testai
npm run test:e2e   # naršyklės testai (bandomasis režimas, tikri duomenys neliečiami)
npm run build      # tipų patikra + gamybinė versija į dist/
```

## Naudojimas be registracijos

Paspaudus „Pradėti be registracijos“ sukuriama anoniminė Supabase paskyra (reikia įjungti Supabase → Authentication → Sign In / Providers → „Allow anonymous sign-ins“).
Duomenys saugomi duomenų bazėje kaip ir visiems, bet prisijungimas laikomas tik tame įrenginyje. Mygtukas „Išsaugoti paskyrą“ prie jos prisieja el. paštą – vartotojo id ir visi įrašai lieka; patvirtinus el. paštą paprašoma nusistatyti slaptažodį.

## Formulės

- Bazinė apykaita (Mifflin-St Jeor): `10 × svoris + 6,25 × ūgis − 5 × amžius + 5` (moteriai `−161`).
- Natūralus deginimas be judėjimo: `BMR × 1,1`.
- Treniruotė: `(MET 4,5 − 1) × svoris × valandos`.
- Žingsniai: `(MET 3,5 − 1) × svoris × (žingsniai / 100) / 60`.
- Riebalų ekvivalentas: `deficitas / 7700`.

Skaičiuojamos tik papildomos kalorijos virš ramybės, kad nebūtų dvigubo įskaitymo.

## Serverio funkcijos nustatymai (Supabase → Edge Functions → Secrets)

| Pavadinimas | Privaloma | Numatyta |
|---|---|---|
| `ANTHROPIC_API_KEY` | taip | – |
| `AI_DAILY_LIMIT` | ne | `150` užklausų per parą registruotam vartotojui |
| `AI_ANON_DAILY_LIMIT` | ne | `40` užklausų per parą naudojančiam be registracijos |
| `AI_GLOBAL_DAILY_LIMIT` | ne | `1500` užklausų per parą visiems kartu (apsauga nuo išlaidų) |
| `AI_MODEL_QUICK` | ne | `claude-haiku-4-5-20251001` |
| `AI_MODEL_DEFAULT` | ne | `claude-sonnet-5-5` (nuotraukos, „Tikslesnis skaičiavimas“, pastebėjimai, alternatyvos) |

Kiekviena AI užklausa įrašoma į lentelę `ai_usage` (modelis, žetonai), kad matytųsi išlaidos.
