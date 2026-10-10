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


alter table public.public_profiles
  add column if not exists profile_no bigint,
  add column if not exists share_slug text;

create unique index if not exists public_profiles_profile_no_idx on public.public_profiles (profile_no);
create unique index if not exists public_profiles_share_slug_idx on public.public_profiles (share_slug);

create table if not exists public.friend_requests_shared (
  id text primary key,
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (from_user, to_user)
);

create table if not exists public.friendships_shared (
  id text primary key,
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_a, user_b)
);

alter table public.friend_requests_shared enable row level security;
alter table public.friendships_shared enable row level security;

grant select, insert, update on public.friend_requests_shared to authenticated;
grant select, insert on public.friendships_shared to authenticated;

drop policy if exists "Users can read their friend requests" on public.friend_requests_shared;
create policy "Users can read their friend requests"
  on public.friend_requests_shared for select
  to authenticated
  using (auth.uid() = from_user or auth.uid() = to_user);

drop policy if exists "Users can create outgoing friend requests" on public.friend_requests_shared;
create policy "Users can create outgoing friend requests"
  on public.friend_requests_shared for insert
  to authenticated
  with check (auth.uid() = from_user and from_user <> to_user);

drop policy if exists "Receivers can answer friend requests" on public.friend_requests_shared;
create policy "Receivers can answer friend requests"
  on public.friend_requests_shared for update
  to authenticated
  using (auth.uid() = to_user)
  with check (auth.uid() = to_user);

drop policy if exists "Users can read their friendships" on public.friendships_shared;
create policy "Users can read their friendships"
  on public.friendships_shared for select
  to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "Users can create accepted friendships" on public.friendships_shared;
create policy "Users can create accepted friendships"
  on public.friendships_shared for insert
  to authenticated
  with check (auth.uid() = user_a or auth.uid() = user_b);
