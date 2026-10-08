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
  main.ts              paleidimas: prisijungimas → (vedlys) → programa, arba bandomasis režimas
  i18n/                kalbos: lt.ts, en.ts (tie patys raktai), t() ir countEntries()
  ui/app.ts            karkasas: apatinė navigacija, ekranų perjungimas
  ui/state.ts          būsena ir veiksmai (įrašymas, taisymas, trynimas su „Atšaukti“)
  ui/sheet.ts          iš apačios išslystantis langas
  ui/views/today.ts    Šiandien: savaitės juosta, žiedas, valgių kortelės
  ui/views/add.ts      Pridėti: maistas, sportas, skaičiuoklė
  ui/views/edit.ts     įrašo, treniruotės, žingsnių taisymas
  ui/views/stats.ts    Statistika ir Claude pastebėjimai
  ui/views/profile.ts  Profilis: tikslai, kalba, Mano produktai, paskyra
  ui/views/onboarding.ts  pirmo paleidimo vedlys
  ui/auth.ts           prisijungimas, registracija, slaptažodžio atkūrimas
  lib/calc.ts          formulės: BMR, natūralus deginimas, sportas, žingsniai, statistika
  data/store.ts        duomenų sluoksnio sąsaja
  data/supabaseStore.ts   tikroji saugykla (Supabase)
  data/memoryStore.ts     bandomoji saugykla (tik atmintyje)
  data/offlineStore.ts    veikimas be interneto: įrašų eilė telefone + paskutinių duomenų kopija
  data/foods.ts        bendra produktų bazė (~190 produktų, 100 g, LT/EN) ir paieška
  lib/off.ts           Open Food Facts: prekė pagal brūkšninį kodą, paieška
  ui/scanner.ts        brūkšninio kodo skaitytuvas (BarcodeDetector arba ZXing)
  ui/views/weight.ts   svoris: kortelė, įrašymas, grafikas
  ui/views/recipe.ts   receptai: kūrimas ir suvalgytos dalies įrašymas
  ui/views/copy.ts     įrašo, valgio ar visos dienos kopijavimas į kitą dieną
  lib/push.ts          telefono pranešimai (Web Push) ir service worker registracija
public/sw.js           service worker: programa atsidaro be interneto, rodo priminimus
  ai/supabaseAi.ts     kviečia serverio funkciją `ai`
  ai/mockAi.ts         netikras AI testams
supabase/
  migrations/          duomenų bazės schema (taikoma eilės tvarka)
  functions/ai/        serverio funkcija ir Claude nurodymai (prompts.ts)
  functions/remind/    priminimų siuntimas (kviečia pg_cron kas 30 min.)
tests/                 formulių testai (Vitest)
e2e/                   naršyklės testai bandomajame režime (Playwright)
scripts/import-artifact.mjs   senų Artifact duomenų perkėlimas
```

## Komandos

```bash
npm install
npm run dev        # programa su tikra Supabase duomenų baze
npm run dev:mock   # bandomasis režimas: duomenys atmintyje, AI netikras (?onboard=1 – vedlys)
npm test           # formulių testai
npm run test:e2e   # naršyklės testai (bandomasis režimas, tikri duomenys neliečiami)
npm run build      # tipų patikra + gamybinė versija į dist/
```

## Naudojimas be registracijos

Paspaudus „Pradėti be registracijos“ sukuriama anoniminė Supabase paskyra (reikia įjungti Supabase → Authentication → Sign In / Providers → „Allow anonymous sign-ins“).
Duomenys saugomi duomenų bazėje kaip ir visiems, bet prisijungimas laikomas tik tame įrenginyje. Mygtukas „Išsaugoti paskyrą“ prie jos prisieja el. paštą – vartotojo id ir visi įrašai lieka; patvirtinus el. paštą paprašoma nusistatyti slaptažodį.

## Be interneto

Visi įrašymai pirmiausia patenka į eilę telefone (`localStorage`, raktas `kd-outbox-<vartotojo id>`) ir išsiunčiami iš eilės.
Jei nėra ryšio, eilė laukia, viršuje rodoma juosta, o atsiradus ryšiui viskas išsiunčiama. Atidarant programą be ryšio rodoma paskutinė duomenų kopija (`kd-cache-…`) su laukiančiais įrašais.

## Produktų paieška

Bendra bazė (`src/data/foods.ts`) veikia be interneto; vertės apytikslės, pagal įprastas maistinės vertės lenteles.
Paieška nepaiso lietuviškų raidžių ir galūnių („vistiena“ randa „Vištienos krūtinėlė“). Prekės pagal brūkšninį kodą ir papildoma paieška – iš [Open Food Facts](https://world.openfoodfacts.org).

## Kalbos

Visi tekstai yra `src/i18n/lt.ts` ir `src/i18n/en.ts`; testas tikrina, kad abiejose kalbose sutaptų raktai ir `{kintamieji}`.
Kalba išsaugoma profilyje (`profiles.lang`). AI nurodymai lietuviški, bet anglų kalbos vartotojui serverio funkcija liepia atsakyti angliškai.

## Dienos tikslo pasiūlymas

`BMR × judėjimas − tempas × 7700 / 7`, kur judėjimas: daugiausia sėdi 1,2, šiek tiek vaikšto 1,35, daug juda 1,5; tempas 0–0,75 kg per savaitę. Minimumas: 1 500 kcal vyrams, 1 200 kcal moterims. Baltymai: 1,6 g/kg.

## Vanduo

Tikslas: ~30 ml vienam kūno svorio kilogramui, suapvalinta iki 250 ml, ribos 1,5–3,5 l, ir dar +0,5 l už kiekvieną sporto valandą tą dieną. Profilyje galima įrašyti savo tikslą.
„Iki dabar vertėtų būti išgėrus“ = tikslas tolygiai paskirstytas tarp priminimų valandų „nuo“ ir „iki“.

## Receptai

Receptas – tai dažnas valgis su porcijų skaičiumi (`saved_meals.servings`, nebūtinai `total_grams`). Įrašant pasirenkama porcijų dalis, ¼ / ⅓ / ½ / visas arba gramai; į dienoraštį įrašoma viena eilutė (`source = 'recipe'`).

## Tikrasis sudeginimas (kalibravimas)

Paskutinės 28 dienos (be šiandienos): `vidutiniškai suvalgyta − svorio pokytis per dieną × 7700`. Svorio pokytis – tiesinė regresija per svėrimus.
Reikia ≥ 14 dienų su įrašais (dienos, kai suvalgyta mažiau nei pusė BMR, neįskaitomos), ≥ 3 svėrimų, apimančių ≥ 14 dienų. Siūlomas tikslas = sudeginimas − tempas × 7700 / 7 (jei sudegintos pridedamos prie limito – atimamas ir vidutinis sportas).

## Priminimai (Web Push)

1. Profilyje vartotojas įjungia priminimus ir „Įjungti pranešimus šiame telefone“ → prenumerata įrašoma į `push_subscriptions` (iPhone – tik kai programa pridėta į pagrindinį ekraną).
2. `pg_cron` kas 30 min. kviečia funkciją `remind` (antraštė `x-cron-secret`).
3. Funkcija vartotojo laiko juostoje sprendžia: vanduo – kas ~2 val., jei atsilieka ≥ 250 ml nuo plano; valgiai – 13–15 val., jei nieko neįrašyta, ir 20–22 val., jei nėra vakarienės. Išsiuntimai žymimi `private.reminder_log`.

Slaptos reikšmės laikomos **Supabase Vault** (ne kode): `vapid_private_key`, `vapid_public_key`, `remind_cron_secret`. Viešas VAPID raktas – `VITE_VAPID_PUBLIC_KEY`.
Patikrinti be siuntimo: `net.http_post(... body := '{"dry":true,"now":"2026-10-08T10:00:00Z"}')`.

## Bandomasis režimas

`npm run dev:mock` – duomenys atmintyje. `?onboard=1` – vedlys, `?demo=1` – 4 savaitės įrašų ir svėrimų (kalibravimui ir serijai pamatyti).

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
