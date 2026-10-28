-- CORE-02 · A shop can serve more than one industry, and each service belongs to one industry.
-- Expand step only: the legacy `shops.industry` column stays the source of truth for now and every write to it is
-- mirrored here by trigger (dual write); the app reads the new table with the legacy column as fallback (dual read).
-- Nothing is dropped or renamed. Rollback: see the bottom of this file.

-- 1 · which industries each shop serves; exactly one is primary -------------------------------------------------
create table if not exists app.shop_industries (
  shop_id    uuid not null references app.shops(id) on delete cascade,
  industry   text not null check (industry in ('nail', 'hair', 'barber', 'spa', 'beauty', 'tattoo', 'pet', 'pilates', 'fitness', 'other')),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (shop_id, industry)
);
create unique index if not exists shop_industries_one_primary on app.shop_industries (shop_id) where is_primary;
alter table app.shop_industries enable row level security;

-- legacy value → industries, primary first. 'both' was a nail salon with a barber chair, never "other".
create or replace function app.legacy_industries(legacy text) returns text[]
  language sql immutable set search_path = '' as $$
  select case when legacy = 'both' then array['nail', 'barber'] else array[legacy] end
$$;

-- which industry a service belongs to when nobody said: its category decides in a 'both' shop, the shop otherwise
create or replace function app.derive_service_industry(legacy text, category text) returns text
  language sql immutable set search_path = '' as $$
  select case when legacy = 'both' then (case when category in ('hair', 'beard') then 'barber' else 'nail' end) else legacy end
$$;

-- make shop_industries match the legacy column; services left in an industry the shop no longer has move to the
-- new primary industry, so switching a shop's type never takes its menu offline (the legacy behaviour)
create or replace function app.sync_shop_industries(p_shop uuid) returns void
  language plpgsql set search_path = '' as $$
declare want text[];
begin
  select app.legacy_industries(s.industry) into want from app.shops s where s.id = p_shop;
  if want is null then return; end if;
  delete from app.shop_industries where shop_id = p_shop and not (industry = any (want));
  update app.shop_industries set is_primary = false where shop_id = p_shop and is_primary and industry <> want[1];
  insert into app.shop_industries (shop_id, industry, is_primary)
    select p_shop, w.industry, w.ord = 1 from unnest(want) with ordinality as w(industry, ord)
  on conflict (shop_id, industry) do update set is_primary = excluded.is_primary;
  update app.services set industry = want[1] where shop_id = p_shop and not (industry = any (want));
end $$;

create or replace function app.shops_sync_industries() returns trigger
  language plpgsql set search_path = '' as $$
begin
  perform app.sync_shop_industries(new.id);
  return null;
end $$;
drop trigger if exists shops_sync_industries on app.shops;
create trigger shops_sync_industries after insert or update of industry on app.shops
  for each row execute function app.shops_sync_industries();

-- 2 · each service names its industry ------------------------------------------------------------------------
alter table app.services add column if not exists industry text
  check (industry in ('nail', 'hair', 'barber', 'spa', 'beauty', 'tattoo', 'pet', 'pilates', 'fitness', 'other'));

-- code that does not know about industries yet (and every insert today) gets the derived value;
-- in a 'both' shop a service that changes category follows it unless someone set its industry by hand
create or replace function app.services_default_industry() returns trigger
  language plpgsql set search_path = '' as $$
declare legacy text;
begin
  select s.industry into legacy from app.shops s where s.id = new.shop_id;
  if tg_op = 'INSERT' then
    if new.industry is null then new.industry := app.derive_service_industry(legacy, new.category); end if;
  elsif new.category is distinct from old.category and new.industry is not distinct from old.industry
        and old.industry = app.derive_service_industry(legacy, old.category) then
    new.industry := app.derive_service_industry(legacy, new.category);
  end if;
  return new;
end $$;
drop trigger if exists services_default_industry on app.services;
create trigger services_default_industry before insert or update of category on app.services
  for each row execute function app.services_default_industry();

-- 3 · backfill, then validate -------------------------------------------------------------------------------
select app.sync_shop_industries(id) from app.shops;
update app.services v set industry = app.derive_service_industry(s.industry, v.category)
  from app.shops s where s.id = v.shop_id and v.industry is null;
alter table app.services alter column industry set not null;
create index if not exists services_shop_industry_idx on app.services (shop_id, industry);

-- the app's server role owns these; nobody else calls them
revoke all on function app.legacy_industries(text), app.derive_service_industry(text, text),
  app.sync_shop_industries(uuid), app.shops_sync_industries(), app.services_default_industry() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on app.shop_industries from anon, authenticated';
  end if;
end $$;

-- Rollback (only while the legacy column is still the source of truth, i.e. before CORE-02's "switch" step):
--   drop trigger if exists services_default_industry on app.services;
--   drop trigger if exists shops_sync_industries on app.shops;
--   alter table app.services drop column if exists industry;
--   drop table if exists app.shop_industries;
--   drop function if exists app.services_default_industry(), app.shops_sync_industries(), app.sync_shop_industries(uuid),
--     app.derive_service_industry(text, text), app.legacy_industries(text);
--   delete from app.schema_migrations where name = '0007_shop_industries.sql';
