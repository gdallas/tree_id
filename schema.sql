-- Sprout database schema
-- Run this once in the Supabase dashboard:  SQL Editor -> New query -> paste -> Run

create table if not exists public.progress (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  score         int  not null default 0,
  correct       int  not null default 0,
  attempts      int  not null default 0,
  streak        int  not null default 0,
  best_streak   int  not null default 0,
  last_category text not null default 'both',
  updated_at    timestamptz not null default now()
);

-- Row Level Security: every user can only read & write their OWN row.
alter table public.progress enable row level security;

create policy "read own progress"   on public.progress for select using (auth.uid() = user_id);
create policy "insert own progress"  on public.progress for insert with check (auth.uid() = user_id);
create policy "update own progress"  on public.progress for update using (auth.uid() = user_id);
