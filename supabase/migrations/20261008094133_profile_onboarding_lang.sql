-- Pirmo paleidimo vedlys ir kalba.
alter table public.profiles
  add column onboarded boolean not null default false,
  add column lang text not null default 'lt' check (lang in ('lt','en')),
  add column activity text not null default 'light' check (activity in ('low','light','mid')),
  add column goal_pace numeric(3,2) not null default 0.5 check (goal_pace between 0 and 1);
