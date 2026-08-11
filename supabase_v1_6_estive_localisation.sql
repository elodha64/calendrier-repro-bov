-- Repro Bovine v1.6.0 — Estive & localisation
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor avant d'utiliser la V1.6 sur les deux téléphones.

alter table public.cows
  add column if not exists current_location_id uuid,
  add column if not exists current_location_name text,
  add column if not exists estive_active boolean not null default false,
  add column if not exists estive_season text;

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  kind text not null default 'parcelle',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists locations_household_name_unique
  on public.locations(household_id, name);
create index if not exists locations_household_idx
  on public.locations(household_id);

create table if not exists public.cow_locations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  cow_id uuid not null references public.cows(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  location_name text,
  moved_at date not null default current_date,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists cow_locations_household_idx
  on public.cow_locations(household_id);
create index if not exists cow_locations_cow_date_idx
  on public.cow_locations(cow_id, moved_at desc);

alter table public.locations enable row level security;
alter table public.cow_locations enable row level security;

drop policy if exists "members manage locations" on public.locations;
create policy "members manage locations"
  on public.locations for all
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists "members manage cow locations" on public.cow_locations;
create policy "members manage cow locations"
  on public.cow_locations for all
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop trigger if exists locations_set_updated_at on public.locations;
create trigger locations_set_updated_at
before update on public.locations
for each row execute function public.set_updated_at();
