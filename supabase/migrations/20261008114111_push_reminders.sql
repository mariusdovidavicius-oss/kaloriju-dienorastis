-- Telefono priminimai (Web Push): prenumeratos, siuntimo žurnalas ir paleidimas kas 30 min.
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------- push_subscriptions: vienas įrašas vienam įrenginiui ----------
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint   text not null unique check (char_length(endpoint) between 10 and 1000),
  p256dh     text not null check (char_length(p256dh) <= 200),
  auth       text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "push_subscriptions: read own"   on public.push_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "push_subscriptions: insert own" on public.push_subscriptions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "push_subscriptions: update own" on public.push_subscriptions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "push_subscriptions: delete own" on public.push_subscriptions for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.push_subscriptions from anon;

-- ---------- private: nepasiekiama per API (tik serverio funkcijai) ----------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.reminder_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind    text not null check (kind in ('water','lunch','dinner')),
  day     date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, day)
);

-- ---------- kas 30 min. kviečiama serverio funkcija `remind` ----------
-- Slaptažodis (remind_cron_secret) ir VAPID raktai laikomi Supabase Vault (įrašomi ne migracija).
select cron.schedule('remind-every-30-min', '*/30 * * * *', $job$
  select net.http_post(
    url := 'https://tnqzrqpirubfjdwzdujq.supabase.co/functions/v1/remind',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'remind_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000)
$job$);
