-- Greitas visų vartotojų paros AI užklausų skaičiavimas (bendras limitas).
create index if not exists ai_usage_created_idx on public.ai_usage (created_at desc);
