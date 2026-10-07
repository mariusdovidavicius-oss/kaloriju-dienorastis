# Nurodymai Claude šiame projekte

- Savininkas: Marius. Programavimo žinios minimalios – visą kodą rašo Claude. Bendraujama **lietuviškai**, sąsajos tekstai lietuviški.
- Supabase projektas: `kaloriju-dienorastis` (ref `tnqzrqpirubfjdwzdujq`). **Jokiu būdu neliesti** kitų tos paskyros projektų (`ItPartner` – gyvas, juo naudojasi žmonės; `itpartner-test`) ir kitų Vercel projektų (`it-partner`, `derin`).
- Schemos pakeitimai – tik naujomis migracijomis `supabase/migrations/` (failo vardas = versija iš `list_migrations`). Po pakeitimų paleisti Supabase saugumo patarėją (advisors).
- Kiekviena nauja lentelė: `user_id` + RLS taisyklės „tik savo eilutės“.
- Prieš įkeliant: `npm test`, `npm run test:e2e`, `npm run build`. Naršyklės testai veikia bandomajame režime (`--mode mock`), kad nebūtų paliesti tikri duomenys.
- Claude nurodymai (prompts) yra `supabase/functions/ai/prompts.ts`; pakeitus – iš naujo įdiegti funkciją `ai`.
- Asmeninių duomenų (mitybos įrašų) į repozitoriją nekelti.
