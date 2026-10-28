-- CORE-04 · Tenant boundaries and sensitive data. Every reference from one shop's row to another row must stay
-- inside the same shop, enforced by the database, not only by the queries that happen to be written today.
-- Adds constraints, a media visibility flag and an audit table. Nothing dropped or renamed. Rollback at the bottom.

-- 1 · parents expose (shop_id, id) so children can point at "this row of my shop" ------------------------------
alter table app.staff     add constraint staff_shop_row     unique (shop_id, id);
alter table app.services  add constraint services_shop_row  unique (shop_id, id);
alter table app.customers add constraint customers_shop_row unique (shop_id, id);
alter table app.resources add constraint resources_shop_row unique (shop_id, id);
alter table app.bookings  add constraint bookings_shop_row  unique (shop_id, id);

-- 2 · children with a shop_id: composite keys next to the existing ones (which keep their delete behaviour).
--     Added NOT VALID, then validated, so existing rows are checked too: a cross-shop row anywhere fails the migration.
alter table app.bookings       add constraint bookings_same_shop_staff     foreign key (shop_id, staff_id)    references app.staff (shop_id, id) not valid;
alter table app.bookings       add constraint bookings_same_shop_customer  foreign key (shop_id, customer_id) references app.customers (shop_id, id) not valid;
alter table app.services       add constraint services_same_shop_resource  foreign key (shop_id, resource_id) references app.resources (shop_id, id) not valid;
alter table app.shifts         add constraint shifts_same_shop_staff       foreign key (shop_id, staff_id)    references app.staff (shop_id, id) not valid;
alter table app.gallery        add constraint gallery_same_shop_staff      foreign key (shop_id, staff_id)    references app.staff (shop_id, id) not valid;
alter table app.gallery        add constraint gallery_same_shop_service    foreign key (shop_id, service_id)  references app.services (shop_id, id) not valid;
alter table app.waitlist       add constraint waitlist_same_shop_staff     foreign key (shop_id, staff_id)    references app.staff (shop_id, id) not valid;
alter table app.shop_members   add constraint shop_members_same_shop_staff foreign key (shop_id, staff_id)    references app.staff (shop_id, id) not valid;
alter table app.member_invites add constraint member_invites_same_shop_staff foreign key (shop_id, staff_id)  references app.staff (shop_id, id) not valid;
alter table app.email_log      add constraint email_log_same_shop_booking  foreign key (shop_id, booking_id)  references app.bookings (shop_id, id) not valid;

alter table app.bookings       validate constraint bookings_same_shop_staff;
alter table app.bookings       validate constraint bookings_same_shop_customer;
alter table app.services       validate constraint services_same_shop_resource;
alter table app.shifts         validate constraint shifts_same_shop_staff;
alter table app.gallery        validate constraint gallery_same_shop_staff;
alter table app.gallery        validate constraint gallery_same_shop_service;
alter table app.waitlist       validate constraint waitlist_same_shop_staff;
alter table app.shop_members   validate constraint shop_members_same_shop_staff;
alter table app.member_invites validate constraint member_invites_same_shop_staff;
alter table app.email_log      validate constraint email_log_same_shop_booking;

-- 3 · rows without their own shop_id, and id arrays, are checked by trigger ------------------------------------
create or replace function app.tenant_mismatch(what text) returns void
  language plpgsql set search_path = '' as $$
begin
  raise exception 'cross-shop reference: %', what using errcode = '23503';
end $$;

create or replace function app.staff_services_same_shop() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if (select shop_id from app.staff where id = new.staff_id) is distinct from (select shop_id from app.services where id = new.service_id) then
    perform app.tenant_mismatch('staff_services');
  end if;
  return new;
end $$;
drop trigger if exists staff_services_same_shop on app.staff_services;
create trigger staff_services_same_shop before insert or update on app.staff_services
  for each row execute function app.staff_services_same_shop();

create or replace function app.booking_items_same_shop() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if new.service_id is not null and
     (select shop_id from app.bookings where id = new.booking_id) is distinct from (select shop_id from app.services where id = new.service_id) then
    perform app.tenant_mismatch('booking_items');
  end if;
  return new;
end $$;
drop trigger if exists booking_items_same_shop on app.booking_items;
create trigger booking_items_same_shop before insert or update on app.booking_items
  for each row execute function app.booking_items_same_shop();

create or replace function app.bookings_resources_same_shop() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from unnest(coalesce(new.resource_ids, '{}')) r(id)
             where not exists (select 1 from app.resources x where x.id = r.id and x.shop_id = new.shop_id)) then
    perform app.tenant_mismatch('bookings.resource_ids');
  end if;
  return new;
end $$;
drop trigger if exists bookings_resources_same_shop on app.bookings;
create trigger bookings_resources_same_shop before insert or update of resource_ids, shop_id on app.bookings
  for each row execute function app.bookings_resources_same_shop();

create or replace function app.waitlist_services_same_shop() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from unnest(coalesce(new.service_ids, '{}') || coalesce(new.addon_ids, '{}')) s(id)
             where not exists (select 1 from app.services x where x.id = s.id and x.shop_id = new.shop_id)) then
    perform app.tenant_mismatch('waitlist.service_ids');
  end if;
  return new;
end $$;
drop trigger if exists waitlist_services_same_shop on app.waitlist;
create trigger waitlist_services_same_shop before insert or update of service_ids, addon_ids, shop_id on app.waitlist
  for each row execute function app.waitlist_services_same_shop();

-- the same checks over existing rows (a cross-shop row stops the migration here)
do $$
begin
  if exists (select 1 from app.staff_services ss join app.staff st on st.id = ss.staff_id join app.services sv on sv.id = ss.service_id where st.shop_id <> sv.shop_id)
    then raise exception 'existing cross-shop staff_services'; end if;
  if exists (select 1 from app.booking_items i join app.bookings b on b.id = i.booking_id join app.services sv on sv.id = i.service_id where b.shop_id <> sv.shop_id)
    then raise exception 'existing cross-shop booking_items'; end if;
  if exists (select 1 from app.bookings b, unnest(b.resource_ids) r(id) where not exists (select 1 from app.resources x where x.id = r.id and x.shop_id = b.shop_id))
    then raise exception 'existing cross-shop bookings.resource_ids'; end if;
  if exists (select 1 from app.waitlist w, unnest(w.service_ids || w.addon_ids) s(id) where not exists (select 1 from app.services x where x.id = s.id and x.shop_id = w.shop_id))
    then raise exception 'existing cross-shop waitlist services'; end if;
end $$;

-- 4 · stored pictures are public (shop page, gallery, team) or private (what a customer sent with a booking) ----
-- pictures already stored stay public, so links already sent keep working (decision D4); new uploads choose.
alter table app.media add column if not exists visibility text not null default 'public'
  check (visibility in ('public', 'private'));

-- 5 · who did what to sensitive data: names of fields and counts, never the values themselves -----------------
create table if not exists app.audit_log (
  id          bigserial primary key,
  shop_id     uuid references app.shops(id) on delete cascade,
  actor_user  uuid references app.users(id) on delete set null,
  action      text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  target_type text check (target_type is null or target_type ~ '^[a-z_]+$'),
  target_id   text check (target_id is null or length(target_id) <= 64),
  detail      jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 2048),
  at          timestamptz not null default now()
);
create index if not exists audit_log_shop_idx on app.audit_log (shop_id, at desc);
alter table app.audit_log enable row level security;

revoke all on function app.tenant_mismatch(text), app.staff_services_same_shop(), app.booking_items_same_shop(),
  app.bookings_resources_same_shop(), app.waitlist_services_same_shop() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on app.audit_log from anon, authenticated';
    execute 'revoke all on sequence app.audit_log_id_seq from anon, authenticated';
  end if;
end $$;

-- Rollback:
--   drop table if exists app.audit_log;
--   alter table app.media drop column if exists visibility;
--   drop trigger if exists waitlist_services_same_shop on app.waitlist;
--   drop trigger if exists bookings_resources_same_shop on app.bookings;
--   drop trigger if exists booking_items_same_shop on app.booking_items;
--   drop trigger if exists staff_services_same_shop on app.staff_services;
--   drop function if exists app.waitlist_services_same_shop(), app.bookings_resources_same_shop(), app.booking_items_same_shop(),
--     app.staff_services_same_shop(), app.tenant_mismatch(text);
--   alter table app.email_log drop constraint if exists email_log_same_shop_booking;
--   alter table app.member_invites drop constraint if exists member_invites_same_shop_staff;
--   alter table app.shop_members drop constraint if exists shop_members_same_shop_staff;
--   alter table app.waitlist drop constraint if exists waitlist_same_shop_staff;
--   alter table app.gallery drop constraint if exists gallery_same_shop_service;
--   alter table app.gallery drop constraint if exists gallery_same_shop_staff;
--   alter table app.shifts drop constraint if exists shifts_same_shop_staff;
--   alter table app.services drop constraint if exists services_same_shop_resource;
--   alter table app.bookings drop constraint if exists bookings_same_shop_customer;
--   alter table app.bookings drop constraint if exists bookings_same_shop_staff;
--   alter table app.bookings drop constraint if exists bookings_shop_row;
--   alter table app.resources drop constraint if exists resources_shop_row;
--   alter table app.customers drop constraint if exists customers_shop_row;
--   alter table app.services drop constraint if exists services_shop_row;
--   alter table app.staff drop constraint if exists staff_shop_row;
--   delete from app.schema_migrations where name = '0009_tenant_boundaries.sql';
