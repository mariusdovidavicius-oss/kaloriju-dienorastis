# Nurodymai Claude šiame projekte

- Savininkas: Marius. Programavimo žinios minimalios – visą kodą rašo Claude. Bendraujama **lietuviškai**, sąsajos tekstai lietuviški.
- Supabase projektas: `kaloriju-dienorastis` (ref `tnqzrqpirubfjdwzdujq`). **Jokiu būdu neliesti** kitų tos paskyros projektų (`ItPartner` – gyvas, juo naudojasi žmonės; `itpartner-test`) ir kitų Vercel projektų (`it-partner`, `derin`).
- Schemos pakeitimai – tik naujomis migracijomis `supabase/migrations/` (failo vardas = versija iš `list_migrations`). Po pakeitimų paleisti Supabase saugumo patarėją (advisors).
- Kiekviena nauja lentelė: `user_id` + RLS taisyklės „tik savo eilutės“.
- Prieš įkeliant: `npm test`, `npm run test:e2e`, `npm run build`. Naršyklės testai veikia bandomajame režime (`--mode mock`), kad nebūtų paliesti tikri duomenys.
- Claude nurodymai (prompts) yra `supabase/functions/ai/prompts.ts`; pakeitus – iš naujo įdiegti funkciją `ai`.
- Asmeninių duomenų (mitybos įrašų) į repozitoriją nekelti.
- Programa dvikalbė (lietuvių ir anglų): naujus tekstus rašyti tik per `t('raktas')`, pridėti į abu `src/i18n/lt.ts` ir `src/i18n/en.ts`.
- Mygtukai ≥ 44 px (testas tikrina ≥ 36 px 320 px ekrane); tikrinti iPhone SE (320 × 568) dydžiu.
- Priminimai: funkcija `remind` (verify_jwt = false, tikrina `x-cron-secret` iš Vault). Slaptos reikšmės tik Vault, niekada ne repozitorijoje.
