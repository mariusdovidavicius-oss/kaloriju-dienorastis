-- Svorio tikslas (rodomas pagrindiniame ekrane).
alter table public.profiles
  add column goal_weight_kg numeric(5,1) check (goal_weight_kg is null or goal_weight_kg between 30 and 300);
