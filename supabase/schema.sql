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
grant select, insert, update on public.friendships_shared to authenticated;

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


-- Repair permissions for shared friend tables after manual resets.
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.friend_requests_shared to authenticated;
grant select, insert, update on public.friendships_shared to authenticated;
grant select, insert, update on public.public_profiles to authenticated;




create table if not exists public.groups_shared (
  id text primary key,
  name text not null,
  description text not null default '',
  searchable boolean not null default false,
  monthly_target bigint not null default 0,
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now()
);

create table if not exists public.group_members_shared (
  id text primary key,
  group_id text not null references public.groups_shared(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  status text not null check (status in ('pending', 'active', 'left')),
  updated_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create table if not exists public.group_links_shared (
  id text primary key,
  group_id text not null references public.groups_shared(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at bigint not null,
  revoked boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.group_invites_shared (
  id text primary key,
  group_id text not null references public.groups_shared(id) on delete cascade,
  group_name text not null,
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined')),
  created_at bigint not null,
  updated_at timestamptz not null default now(),
  unique (group_id, to_user)
);

alter table public.groups_shared enable row level security;
alter table public.group_members_shared enable row level security;
alter table public.group_links_shared enable row level security;
alter table public.group_invites_shared enable row level security;

grant select, insert, update on public.groups_shared to authenticated;
grant select, insert, update on public.group_members_shared to authenticated;
grant select, insert, update on public.group_links_shared to authenticated;
grant select, insert, update on public.group_invites_shared to authenticated;

drop policy if exists "Signed in users can read shared groups" on public.groups_shared;
create policy "Signed in users can read shared groups"
  on public.groups_shared for select
  to authenticated
  using (true);

drop policy if exists "Creators can write shared groups" on public.groups_shared;
create policy "Creators can write shared groups"
  on public.groups_shared for insert
  to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "Creators can update shared groups" on public.groups_shared;
create policy "Creators can update shared groups"
  on public.groups_shared for update
  to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

drop policy if exists "Signed in users can read shared group members" on public.group_members_shared;
create policy "Signed in users can read shared group members"
  on public.group_members_shared for select
  to authenticated
  using (true);

drop policy if exists "Users can insert their shared group membership" on public.group_members_shared;
create policy "Users can insert their shared group membership"
  on public.group_members_shared for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their shared group membership" on public.group_members_shared;
create policy "Users can update their shared group membership"
  on public.group_members_shared for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Signed in users can read shared group links" on public.group_links_shared;
create policy "Signed in users can read shared group links"
  on public.group_links_shared for select
  to authenticated
  using (true);

drop policy if exists "Members can create shared group links" on public.group_links_shared;
create policy "Members can create shared group links"
  on public.group_links_shared for insert
  to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "Creators can update shared group links" on public.group_links_shared;
create policy "Creators can update shared group links"
  on public.group_links_shared for update
  to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

drop policy if exists "Users can read their shared group invites" on public.group_invites_shared;
create policy "Users can read their shared group invites"
  on public.group_invites_shared for select
  to authenticated
  using (auth.uid() = from_user or auth.uid() = to_user);

drop policy if exists "Users can send shared group invites" on public.group_invites_shared;
create policy "Users can send shared group invites"
  on public.group_invites_shared for insert
  to authenticated
  with check (auth.uid() = from_user and from_user <> to_user);

drop policy if exists "Invite participants can update shared group invites" on public.group_invites_shared;
create policy "Invite participants can update shared group invites"
  on public.group_invites_shared for update
  to authenticated
  using (auth.uid() = from_user or auth.uid() = to_user)
  with check (auth.uid() = from_user or auth.uid() = to_user);
