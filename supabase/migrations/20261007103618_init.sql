-- Kalorijų dienoraštis: pradinė duomenų bazės schema.
-- Kiekviena lentelė turi user_id ir RLS taisykles: vartotojas mato ir keičia tik savo eilutes.

-- ---------- pagalbinės ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- profiles: tikslai ir kūno duomenys ----------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  kcal_goal     integer not null default 2000 check (kcal_goal between 800 and 6000),
  protein_goal  integer not null default 160  check (protein_goal between 20 and 400),
  weight_kg     numeric(5,1) not null default 80 check (weight_kg between 30 and 300),
  age           integer not null default 35   check (age between 14 and 100),
  height_cm     integer not null default 175  check (height_cm between 120 and 230),
  sex           text not null default 'm' check (sex in ('m','f')),
  add_burned    boolean not null default false,  -- pridėti sudegintas kcal prie limito
  accurate      boolean not null default false,  -- tikslesnis (galingesnis) AI modelis
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- naujam vartotojui automatiškai sukuriamas profilis
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- products: Mano produktai (vertės vienam vienetui) ----------
create table public.products (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  unit       text not null check (char_length(unit) between 1 and 30),  -- pvz. "riekė", "100 g"
  grams      numeric(7,1) check (grams is null or grams >= 0),        -- vieneto svoris
  kcal       numeric(7,1) not null check (kcal >= 0),
  protein    numeric(6,1) not null default 0 check (protein >= 0),
  carbs      numeric(6,1) not null default 0 check (carbs >= 0),
  fat        numeric(6,1) not null default 0 check (fat >= 0),
  created_at timestamptz not null default now()
);
create index products_user_idx on public.products (user_id);

-- ---------- food_entries: suvalgyto maisto įrašai ----------
create table public.food_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day         date not null,
  meal        text not null check (meal in ('pusryciai','pietus','vakariene','uzkandis')),
  name        text not null check (char_length(name) between 1 and 80),
  amount      text not null default '' check (char_length(amount) <= 60),
  kcal        integer not null check (kcal between 0 and 20000),
  protein     numeric(6,1) not null default 0 check (protein >= 0),
  carbs       numeric(6,1) not null default 0 check (carbs >= 0),
  fat         numeric(6,1) not null default 0 check (fat >= 0),
  eaten_at    timestamptz not null default now(),
  product_id  uuid references public.products(id) on delete set null,   -- jei iš Mano produktų
  maybe_product_id uuid references public.products(id) on delete set null, -- „Gal tai …?“ pasiūlymas
  maybe_units numeric(6,2),
  source      text not null default 'ai' check (source in ('ai','manual','product','meal','calc','import')),
  created_at  timestamptz not null default now()
);
create index food_entries_user_day_idx on public.food_entries (user_id, day);
create index food_entries_product_idx on public.food_entries (product_id);
create index food_entries_maybe_idx on public.food_entries (maybe_product_id);

-- ---------- saved_meals: Dažni valgiai ----------
create table public.saved_meals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);
create index saved_meals_user_idx on public.saved_meals (user_id);

create table public.saved_meal_items (
  id         uuid primary key default gen_random_uuid(),
  meal_id    uuid not null references public.saved_meals(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position   integer not null default 0,
  name       text not null check (char_length(name) between 1 and 80),
  amount     text not null default '',
  kcal       integer not null check (kcal >= 0),
  protein    numeric(6,1) not null default 0,
  carbs      numeric(6,1) not null default 0,
  fat        numeric(6,1) not null default 0
);
create index saved_meal_items_meal_idx on public.saved_meal_items (meal_id);
create index saved_meal_items_user_idx on public.saved_meal_items (user_id);

-- ---------- workouts: treniruotės ----------
create table public.workouts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day        date not null,
  name       text not null default 'Treniruotė' check (char_length(name) between 1 and 80),
  minutes    integer check (minutes is null or minutes between 1 and 600),
  amount     text not null default '',
  kcal       integer not null check (kcal between 0 and 10000),
  logged_at  timestamptz not null default now()
);
create index workouts_user_day_idx on public.workouts (user_id, day);

-- ---------- daily_steps: viena eilutė per dieną ----------
create table public.daily_steps (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day        date not null,
  steps      integer not null check (steps between 0 and 200000),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
create trigger daily_steps_updated_at before update on public.daily_steps
  for each row execute function public.set_updated_at();

-- ---------- weight_log: svoris (kai bus svarstyklės) ----------
create table public.weight_log (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day        date not null,
  weight_kg  numeric(5,1) not null check (weight_kg between 30 and 300),
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- ---------- insights: Claude pastebėjimai ----------
create table public.insights (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  period_days integer not null check (period_days between 1 and 90),
  text        text not null,
  created_at  timestamptz not null default now()
);
create index insights_user_created_idx on public.insights (user_id, created_at desc);

-- ---------- ai_usage: AI užklausų žurnalas (rašo tik serverio funkcija) ----------
create table public.ai_usage (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  task          text not null,
  model         text not null,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  ok            boolean not null default true,
  created_at    timestamptz not null default now()
);
create index ai_usage_user_created_idx on public.ai_usage (user_id, created_at desc);

-- ---------- RLS ----------
alter table public.profiles         enable row level security;
alter table public.products         enable row level security;
alter table public.food_entries     enable row level security;
alter table public.saved_meals      enable row level security;
alter table public.saved_meal_items enable row level security;
alter table public.workouts         enable row level security;
alter table public.daily_steps      enable row level security;
alter table public.weight_log       enable row level security;
alter table public.insights         enable row level security;
alter table public.ai_usage         enable row level security;

-- profiles: tik savo eilutė (kuriama trigeriu, todėl insert nereikia)
create policy "profiles: read own"   on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- bendros taisyklės lentelėms su user_id
do $$
declare t text;
begin
  foreach t in array array['products','food_entries','saved_meals','saved_meal_items','workouts','daily_steps','weight_log','insights'] loop
    execute format('create policy "%1$s: read own"   on public.%1$I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s: insert own" on public.%1$I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s: update own" on public.%1$I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s: delete own" on public.%1$I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- ai_usage: vartotojas gali tik skaityti savo žurnalą
create policy "ai_usage: read own" on public.ai_usage for select to authenticated using ((select auth.uid()) = user_id);

-- saved_meal_items turi priklausyti savo valgiui (apsauga nuo svetimo meal_id)
create or replace function public.check_meal_owner()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.saved_meals m where m.id = new.meal_id and m.user_id = new.user_id) then
    raise exception 'meal does not belong to user';
  end if;
  return new;
end $$;
create trigger saved_meal_items_owner before insert or update on public.saved_meal_items
  for each row execute function public.check_meal_owner();

-- food_entries produktų nuorodos turi būti savos
create or replace function public.check_entry_products()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.product_id is not null and not exists (select 1 from public.products p where p.id = new.product_id and p.user_id = new.user_id) then
    raise exception 'product does not belong to user';
  end if;
  if new.maybe_product_id is not null and not exists (select 1 from public.products p where p.id = new.maybe_product_id and p.user_id = new.user_id) then
    raise exception 'product does not belong to user';
  end if;
  return new;
end $$;
create trigger food_entries_products before insert or update on public.food_entries
  for each row execute function public.check_entry_products();

-- anon (neprisijungęs) neturi jokių teisių
revoke all on all tables in schema public from anon;
