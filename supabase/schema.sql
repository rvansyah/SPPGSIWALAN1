-- SPPG SIWALAN 1: skema login lintas perangkat + sinkronisasi seluruh data aplikasi.
-- Jalankan sekali di Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'petugas' check (role in ('admin','petugas','pimpinan')),
  created_at timestamptz not null default now()
);

create table if not exists public.app_state (
  id integer primary key check (id = 1),
  payload jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.app_state enable row level security;

drop policy if exists "profile read own or admin" on public.profiles;
create policy "profile read own or admin" on public.profiles for select to authenticated
using (id = auth.uid());

drop policy if exists "app state read authenticated" on public.app_state;
create policy "app state read authenticated" on public.app_state for select to authenticated using (true);
drop policy if exists "app state insert authenticated" on public.app_state;
create policy "app state insert authenticated" on public.app_state for insert to authenticated with check (true);
drop policy if exists "app state update authenticated" on public.app_state;
create policy "app state update authenticated" on public.app_state for update to authenticated using (true) with check (true);

-- Menghindari recursive RLS ketika fungsi memeriksa apakah admin sudah ada.
create or replace function public.sppg_has_admin()
returns boolean language sql security definer set search_path = public
as $$ select exists (select 1 from public.profiles where role = 'admin'); $$;
grant execute on function public.sppg_has_admin() to anon, authenticated;

-- Hanya dapat berhasil jika belum ada admin. UID berasal dari sesi Supabase Auth.
create or replace function public.sppg_bootstrap_admin(p_full_name text)
returns void language plpgsql security definer set search_path = public, auth
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Harus login terlebih dahulu'; end if;
  if exists (select 1 from public.profiles where role = 'admin') then raise exception 'Admin sudah terdaftar'; end if;
  insert into public.profiles(id, full_name, role) values (v_uid, coalesce(nullif(trim(p_full_name),''),'Administrator'), 'admin')
  on conflict (id) do update set full_name = excluded.full_name, role = 'admin';
end; $$;
grant execute on function public.sppg_bootstrap_admin(text) to authenticated;

-- Pendaftaran petugas hanya membuat role petugas; tidak pernah memberi hak admin.
create or replace function public.sppg_register_petugas(p_full_name text)
returns void language plpgsql security definer set search_path = public, auth
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Harus login terlebih dahulu'; end if;
  if not exists (select 1 from public.profiles where role = 'admin') then raise exception 'Admin pertama belum dibuat'; end if;
  insert into public.profiles(id, full_name, role) values (v_uid, coalesce(nullif(trim(p_full_name),''),'Petugas'), 'petugas')
  on conflict (id) do nothing;
end; $$;
grant execute on function public.sppg_register_petugas(text) to authenticated;

-- Membuat profil dasar untuk akun yang dibuat melalui Dashboard Auth.
create or replace function public.sppg_profile_on_signup()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), 'petugas')
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists sppg_auth_user_profile on auth.users;
create trigger sppg_auth_user_profile after insert on auth.users
for each row execute procedure public.sppg_profile_on_signup();

-- Aplikasi menyimpan state stok, transaksi, penerima manfaat, dan data laporan dalam satu payload JSON.
-- Data cloud menjadi sumber utama untuk semua perangkat.
