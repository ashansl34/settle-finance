-- Settle MVP Supabase schema
-- Run this in Supabase Dashboard → SQL Editor.

create table if not exists public.app_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_states enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.app_states to authenticated;

drop policy if exists "Users can read their own app state" on public.app_states;
create policy "Users can read their own app state"
  on public.app_states for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own app state" on public.app_states;
create policy "Users can insert their own app state"
  on public.app_states for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own app state" on public.app_states;
create policy "Users can update their own app state"
  on public.app_states for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


create table if not exists public.public_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  handle text not null,
  public_id text not null unique,
  email text,
  updated_at timestamptz not null default now()
);

alter table public.public_profiles enable row level security;

grant select, insert, update on public.public_profiles to authenticated;

create index if not exists public_profiles_handle_idx on public.public_profiles (lower(handle));
create index if not exists public_profiles_public_id_idx on public.public_profiles (public_id);

drop policy if exists "Signed in users can read public profiles" on public.public_profiles;
create policy "Signed in users can read public profiles"
  on public.public_profiles for select
  to authenticated
  using (true);

drop policy if exists "Users can insert their own public profile" on public.public_profiles;
create policy "Users can insert their own public profile"
  on public.public_profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own public profile" on public.public_profiles;
create policy "Users can update their own public profile"
  on public.public_profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
