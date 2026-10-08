-- 3 etapas: vanduo, receptai, priminimų nustatymai.

-- ---------- daily_water: išgerta per dieną, ml ----------
create table public.daily_water (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day        date not null,
  ml         integer not null check (ml between 0 and 20000),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
create trigger daily_water_updated_at before update on public.daily_water
  for each row execute function public.set_updated_at();
alter table public.daily_water enable row level security;
create policy "daily_water: read own"   on public.daily_water for select to authenticated using ((select auth.uid()) = user_id);
create policy "daily_water: insert own" on public.daily_water for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "daily_water: update own" on public.daily_water for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "daily_water: delete own" on public.daily_water for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.daily_water from anon;

-- ---------- receptai: saved_meals su porcijų skaičiumi ----------
-- servings null – įprastas dažnas valgis; skaičius – receptas (visas puodas = servings porcijų).
alter table public.saved_meals
  add column servings numeric(5,2) check (servings is null or servings between 0.25 and 100),
  add column total_grams integer check (total_grams is null or total_grams between 1 and 50000);

alter table public.food_entries drop constraint if exists food_entries_source_check;
alter table public.food_entries add constraint food_entries_source_check
  check (source in ('ai','manual','product','meal','calc','import','recipe'));

-- ---------- profiles: vanduo ir priminimai ----------
alter table public.profiles
  add column water_goal_ml integer check (water_goal_ml is null or water_goal_ml between 500 and 8000),
  add column remind_water boolean not null default false,
  add column remind_meals boolean not null default false,
  add column remind_from smallint not null default 9 check (remind_from between 0 and 23),
  add column remind_to smallint not null default 21 check (remind_to between 1 and 24),
  add column tz text not null default 'Europe/Vilnius' check (char_length(tz) between 1 and 60);
