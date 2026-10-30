-- CORE-05 · Service versions and intake forms. Expand only. Rollback at the bottom.
--   * Every change to what a service is (name, time, price, kind, category, industry) makes a new, immutable
--     version; booked items point at the version they were booked with.
--   * A shop can ask a few bounded questions per industry; each edit is a new immutable form version, and each
--     booking keeps the answers with the version they answered and whether the shop still has to review them.

-- 1 · service versions ------------------------------------------------------------------------------------------
create table if not exists app.service_versions (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references app.shops(id) on delete cascade,
  service_id   uuid references app.services(id) on delete set null,
  version      int not null check (version >= 1),
  industry     text not null,
  kind         text not null,
  category     text not null,
  name         text not null,
  name_zh      text,
  duration_min int not null,
  price_cents  int,
  price_from   boolean not null,
  currency     text not null,
  created_at   timestamptz not null default now(),
  unique (service_id, version)
);
create index if not exists service_versions_shop_idx on app.service_versions (shop_id);
alter table app.service_versions enable row level security;

alter table app.services add column if not exists current_version int not null default 0;

create or replace function app.services_new_version() returns trigger
  language plpgsql set search_path = '' as $$
declare v int;
begin
  if tg_op = 'UPDATE' and (new.name, new.name_zh, new.duration_min, new.price_cents, new.price_from, new.kind, new.category, new.industry)
      is not distinct from (old.name, old.name_zh, old.duration_min, old.price_cents, old.price_from, old.kind, old.category, old.industry) then
    return null;
  end if;
  select coalesce(max(version), 0) + 1 into v from app.service_versions where service_id = new.id;
  insert into app.service_versions (shop_id, service_id, version, industry, kind, category, name, name_zh, duration_min, price_cents, price_from, currency)
    select new.shop_id, new.id, v, new.industry, new.kind, new.category, new.name, new.name_zh, new.duration_min, new.price_cents, new.price_from, s.currency
    from app.shops s where s.id = new.shop_id;
  update app.services set current_version = v where id = new.id;
  return null;
end $$;
drop trigger if exists services_new_version on app.services;
create trigger services_new_version after insert or update of name, name_zh, duration_min, price_cents, price_from, kind, category, industry on app.services
  for each row execute function app.services_new_version();

-- versions never change; the only update allowed is the database clearing service_id when a service is deleted
create or replace function app.service_versions_immutable() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if new.service_id is null and old.service_id is not null
     and (to_jsonb(new) - 'service_id') = (to_jsonb(old) - 'service_id') then
    return new;
  end if;
  raise exception 'service versions are immutable' using errcode = '55000';
end $$;
drop trigger if exists service_versions_immutable on app.service_versions;
create trigger service_versions_immutable before update on app.service_versions
  for each row execute function app.service_versions_immutable();

-- version 1 of every existing service is what it is today (booked items keep their own copy of what was booked)
insert into app.service_versions (shop_id, service_id, version, industry, kind, category, name, name_zh, duration_min, price_cents, price_from, currency)
  select v.shop_id, v.id, 1, v.industry, v.kind, v.category, v.name, v.name_zh, v.duration_min, v.price_cents, v.price_from, s.currency
  from app.services v join app.shops s on s.id = v.shop_id
  where not exists (select 1 from app.service_versions x where x.service_id = v.id);
update app.services v set current_version = (select max(version) from app.service_versions x where x.service_id = v.id)
  where current_version = 0;

alter table app.booking_items add column if not exists service_version_id uuid references app.service_versions(id) on delete set null;
update app.booking_items i set service_version_id = x.id
  from app.service_versions x where x.service_id = i.service_id and x.version = 1 and i.service_version_id is null;

-- booked items: the version must be one of this shop's (extends the CORE-04 check)
create or replace function app.booking_items_same_shop() returns trigger
  language plpgsql set search_path = '' as $$
declare b_shop uuid;
begin
  select shop_id into b_shop from app.bookings where id = new.booking_id;
  if new.service_id is not null and b_shop is distinct from (select shop_id from app.services where id = new.service_id) then
    perform app.tenant_mismatch('booking_items');
  end if;
  if new.service_version_id is not null and b_shop is distinct from (select shop_id from app.service_versions where id = new.service_version_id) then
    perform app.tenant_mismatch('booking_items.service_version_id');
  end if;
  return new;
end $$;

-- 2 · intake forms ----------------------------------------------------------------------------------------------
create table if not exists app.intake_forms (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references app.shops(id) on delete cascade,
  industry   text not null check (industry in ('nail', 'hair', 'barber', 'spa', 'beauty', 'tattoo', 'pet', 'pilates', 'fitness', 'other')),
  version    int not null check (version >= 1),
  schema     jsonb not null check (jsonb_typeof(schema -> 'fields') = 'array' and pg_column_size(schema) <= 16384),
  active     boolean not null,
  created_by uuid references app.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (shop_id, industry, version),
  unique (shop_id, id)
);
alter table app.intake_forms enable row level security;

create or replace function app.intake_forms_immutable() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if new.created_by is null and old.created_by is not null and (to_jsonb(new) - 'created_by') = (to_jsonb(old) - 'created_by') then
    return new; -- the author's account was deleted
  end if;
  raise exception 'intake form versions are immutable' using errcode = '55000';
end $$;
drop trigger if exists intake_forms_immutable on app.intake_forms;
create trigger intake_forms_immutable before update on app.intake_forms
  for each row execute function app.intake_forms_immutable();

create table if not exists app.intake_responses (
  booking_id      uuid primary key,
  shop_id         uuid not null,
  form_id         uuid not null,
  answers         jsonb not null check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 8192),
  requires_review boolean not null,
  review_state    text not null check (review_state in ('not_needed', 'pending', 'approved', 'declined')),
  reviewed_by     uuid references app.users(id) on delete set null,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  foreign key (shop_id, booking_id) references app.bookings (shop_id, id) on delete cascade,
  foreign key (shop_id, form_id) references app.intake_forms (shop_id, id),
  check ((review_state = 'not_needed') = (not requires_review))
);
create index if not exists intake_responses_pending_idx on app.intake_responses (shop_id) where review_state = 'pending';
alter table app.intake_responses enable row level security;

revoke all on function app.services_new_version(), app.service_versions_immutable(), app.intake_forms_immutable() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on app.service_versions, app.intake_forms, app.intake_responses from anon, authenticated';
  end if;
end $$;

-- Rollback:
--   drop table if exists app.intake_responses;
--   drop table if exists app.intake_forms;
--   drop function if exists app.intake_forms_immutable();
--   create or replace function app.booking_items_same_shop() returns trigger language plpgsql set search_path = '' as $f$
--   begin
--     if new.service_id is not null and (select shop_id from app.bookings where id = new.booking_id) is distinct from (select shop_id from app.services where id = new.service_id) then
--       perform app.tenant_mismatch('booking_items');
--     end if;
--     return new;
--   end $f$;
--   alter table app.booking_items drop column if exists service_version_id;
--   drop trigger if exists services_new_version on app.services;
--   alter table app.services drop column if exists current_version;
--   drop table if exists app.service_versions;
--   drop function if exists app.services_new_version(), app.service_versions_immutable();
--   delete from app.schema_migrations where name = '0010_versions_and_forms.sql';
