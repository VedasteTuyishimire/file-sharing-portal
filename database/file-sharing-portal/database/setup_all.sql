-- =====================================================================
-- FILE SHARING PORTAL - COMPLETE SUPABASE SETUP (run once, safe to re-run)
-- Paste this whole file into Supabase > SQL Editor > New query > Run
-- BEFORE RUNNING: change YOUR-OWNER-EMAIL@example.com near the bottom.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PART A: TABLES
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  role text not null default 'recipient' check (role in ('owner','recipient')),
  created_at timestamptz default now()
);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  original_name text not null,
  storage_path text not null unique,
  file_type text,
  file_size bigint,
  uploaded_at timestamptz default now()
);

create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active','revoked')),
  shared_at timestamptz default now(),
  unique (file_id, recipient_id)
);

create table if not exists public.activity_log (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  file_id uuid references public.files(id) on delete set null,
  action text not null check (action in ('upload','share','revoke','download','delete')),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- PART A2: AUTO-CREATE A PROFILE WHEN SOMEONE SIGNS UP
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case when new.raw_user_meta_data->>'role' in ('owner','recipient')
         then new.raw_user_meta_data->>'role' else 'recipient' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Create profiles for users that already exist
insert into public.profiles (id, email, role)
select id, email, 'recipient' from auth.users
on conflict (id) do nothing;

-- Make one existing user the owner (CHANGE THIS EMAIL)
update public.profiles
set role = 'owner'
where email = 'YOUR-OWNER-EMAIL@example.com';

-- ---------------------------------------------------------------------
-- PART B: ROW LEVEL SECURITY
-- ---------------------------------------------------------------------

alter table public.profiles     enable row level security;
alter table public.files        enable row level security;
alter table public.shares       enable row level security;
alter table public.activity_log enable row level security;

-- Helper to avoid a policy loop between files and shares
create or replace function public.is_file_owner(f_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.files where id = f_id and owner_id = auth.uid());
$$;

-- PROFILES
drop policy if exists "profiles readable by logged in users" on public.profiles;
create policy "profiles readable by logged in users"
  on public.profiles for select to authenticated using (true);

-- FILES
drop policy if exists "owner manages own files" on public.files;
create policy "owner manages own files"
  on public.files for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "recipient views files shared with them" on public.files;
create policy "recipient views files shared with them"
  on public.files for select to authenticated
  using (exists (
    select 1 from public.shares s
    where s.file_id = files.id
      and s.recipient_id = auth.uid()
      and s.status = 'active'
      and (s.expires_at is null or s.expires_at > now())
  ));

-- SHARES
drop policy if exists "owner manages shares of own files" on public.shares;
create policy "owner manages shares of own files"
  on public.shares for all to authenticated
  using (public.is_file_owner(file_id))
  with check (public.is_file_owner(file_id));

drop policy if exists "recipient sees own shares" on public.shares;
create policy "recipient sees own shares"
  on public.shares for select to authenticated
  using (recipient_id = auth.uid());

-- ACTIVITY LOG
drop policy if exists "users add own log entries" on public.activity_log;
create policy "users add own log entries"
  on public.activity_log for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "users read own log entries" on public.activity_log;
create policy "users read own log entries"
  on public.activity_log for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- PART C: PRIVATE STORAGE BUCKET (10 MB limit)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 10485760)
on conflict (id) do nothing;

drop policy if exists "owners upload to own folder" on storage.objects;
create policy "owners upload to own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "owners read own files" on storage.objects;
create policy "owners read own files"
  on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "owners delete own files" on storage.objects;
create policy "owners delete own files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "recipients read shared files" on storage.objects;
create policy "recipients read shared files"
  on storage.objects for select to authenticated
  using (bucket_id = 'files' and exists (
    select 1 from public.files f where f.storage_path = storage.objects.name
  ));

-- =====================================================================
-- DONE. Check: Table Editor shows 4 tables, Storage shows bucket "files".
-- =====================================================================

-- ---------------------------------------------------------------------
-- PART D: TABLE PERMISSIONS (needed on newer Supabase projects)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.files to authenticated;
grant select, insert, update, delete on public.shares to authenticated;
grant select, insert on public.activity_log to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------
-- PART E: owners can see activity (downloads, shares) on their own files
-- ---------------------------------------------------------------------
drop policy if exists "owners read log of own files" on public.activity_log;
create policy "owners read log of own files"
  on public.activity_log for select to authenticated
  using (file_id is not null and public.is_file_owner(file_id));
