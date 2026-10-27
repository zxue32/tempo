-- Tempo booking platform: initial schema
-- All app tables live in the "app" schema, which Supabase does not expose through its public Data API.
-- Row Level Security is also enabled with no policies, so even if the schema were exposed,
-- the anon/authenticated keys could not read or write anything. The server connects as the table owner.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create schema if not exists app;
set search_path = app, public;

-- ---------------------------------------------------------------- helpers
create or replace function app.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- users
-- Mirror of the auth provider's users (Supabase Auth). id = auth user id.
create table app.users (
  id          uuid primary key,
  email       text not null,
  name        text,
  lang        text not null default 'zh' check (lang in ('zh', 'en')),
  created_at  timestamptz not null default now(),
  last_seen_at timestamptz
);
create unique index users_email_key on app.users (lower(email));

-- ---------------------------------------------------------------- platform invites
create table app.platform_invites (
  code        text primary key,
  note        text,
  max_uses    int not null default 1 check (max_uses > 0),
  uses        int not null default 0,
  expires_at  timestamptz,
  created_by  uuid references app.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- shops
create table app.shops (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$'),
  status          text not null default 'draft'
                  check (status in ('draft', 'pending', 'changes', 'live', 'rejected', 'suspended')),
  industry        text not null default 'nail' check (industry in ('nail', 'barber', 'both')),
  name            text not null check (length(name) between 1 and 80),
  name_zh         text check (name_zh is null or length(name_zh) <= 80),
  about_en        text check (about_en is null or length(about_en) <= 2000),
  about_zh        text check (about_zh is null or length(about_zh) <= 2000),
  theme           text not null default 'lacquer',
  accent          text check (accent is null or accent ~ '^#[0-9a-fA-F]{6}$'),
  logo_url        text,
  cover_url       text,
  phone           text,
  email           text,
  address         text,
  city            text,
  map_url         text,
  instagram       text,
  timezone        text not null default 'America/New_York',
  default_lang    text not null default 'en' check (default_lang in ('zh', 'en')),
  hours           jsonb not null default '{
                    "0": {"closed": false, "open": 660, "close": 1020},
                    "1": {"closed": false, "open": 600, "close": 1140},
                    "2": {"closed": false, "open": 600, "close": 1140},
                    "3": {"closed": false, "open": 600, "close": 1140},
                    "4": {"closed": false, "open": 600, "close": 1140},
                    "5": {"closed": false, "open": 600, "close": 1140},
                    "6": {"closed": false, "open": 600, "close": 1140}
                  }'::jsonb,
  -- booking rules
  slot_minutes          int not null default 15 check (slot_minutes in (5, 10, 15, 20, 30, 60)),
  lead_minutes          int not null default 240 check (lead_minutes between 0 and 10080),
  max_days              int not null default 60 check (max_days between 1 and 365),
  cancel_cutoff_minutes int not null default 480 check (cancel_cutoff_minutes between 0 and 10080),
  buffer_minutes        int not null default 0 check (buffer_minutes between 0 and 120),
  max_guests            int not null default 4 check (max_guests between 1 and 10),
  allow_any_staff       boolean not null default true,
  show_prices           boolean not null default true,
  booking_note_en       text check (booking_note_en is null or length(booking_note_en) <= 1000),
  booking_note_zh       text check (booking_note_zh is null or length(booking_note_zh) <= 1000),
  notify_emails         text[] not null default '{}',
  notify_staff          boolean not null default true,
  -- review workflow
  invite_code     text references app.platform_invites(code) on delete set null,
  review_note     text,
  submitted_at    timestamptz,
  reviewed_at     timestamptz,
  reviewed_by     uuid references app.users(id) on delete set null,
  live_at         timestamptz,
  owner_id        uuid not null references app.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index shops_status_idx on app.shops (status, submitted_at);
create trigger shops_touch before update on app.shops for each row execute function app.touch_updated_at();

create table app.special_days (
  shop_id   uuid not null references app.shops(id) on delete cascade,
  date      date not null,
  closed    boolean not null default true,
  open_min  int check (open_min between 0 and 1440),
  close_min int check (close_min between 0 and 1440),
  note      text,
  primary key (shop_id, date),
  check (closed or (open_min is not null and close_min is not null and close_min > open_min))
);

-- ---------------------------------------------------------------- staff
create table app.staff (
  id               uuid primary key default gen_random_uuid(),
  shop_id          uuid not null references app.shops(id) on delete cascade,
  name             text not null check (length(name) between 1 and 60),
  name_zh          text,
  bio_en           text,
  bio_zh           text,
  color            text not null default '#C8445A' check (color ~ '^#[0-9a-fA-F]{6}$'),
  photo_url        text,
  active           boolean not null default true,
  bookable_online  boolean not null default true,
  commission_pct   numeric(5,2) not null default 40 check (commission_pct between 0 and 100),
  sort             int not null default 0,
  -- default weekly roster used to fill new weeks: {"1": {"start": 600, "end": 1080, "breaks": [[780, 810]]}, ...}
  default_week     jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index staff_shop_idx on app.staff (shop_id, sort);
create trigger staff_touch before update on app.staff for each row execute function app.touch_updated_at();

create table app.shop_members (
  shop_id     uuid not null references app.shops(id) on delete cascade,
  user_id     uuid not null references app.users(id) on delete cascade,
  role        text not null check (role in ('owner', 'manager', 'staff')),
  staff_id    uuid references app.staff(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (shop_id, user_id)
);
create index shop_members_user_idx on app.shop_members (user_id);

create table app.member_invites (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references app.shops(id) on delete cascade,
  email       text not null,
  role        text not null check (role in ('manager', 'staff')),
  staff_id    uuid references app.staff(id) on delete cascade,
  token       text not null unique,
  invited_by  uuid references app.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz
);
create index member_invites_email_idx on app.member_invites (lower(email)) where accepted_at is null;

-- ---------------------------------------------------------------- services
create table app.services (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references app.shops(id) on delete cascade,
  kind         text not null default 'service' check (kind in ('service', 'addon')),
  category     text not null default 'other',
  applies_to   text[] not null default '{}',  -- add-ons: categories they can be added to
  name         text not null check (length(name) between 1 and 80),
  name_zh      text,
  desc_en      text,
  desc_zh      text,
  duration_min int not null check (duration_min between 5 and 600),
  price_cents  int check (price_cents is null or price_cents between 0 and 10000000),
  price_from   boolean not null default false,
  active       boolean not null default true,
  online       boolean not null default true,
  sort         int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index services_shop_idx on app.services (shop_id, kind, sort);
create trigger services_touch before update on app.services for each row execute function app.touch_updated_at();

-- which services each staff member does, optionally with their own duration
create table app.staff_services (
  staff_id     uuid not null references app.staff(id) on delete cascade,
  service_id   uuid not null references app.services(id) on delete cascade,
  duration_min int check (duration_min is null or duration_min between 5 and 600),
  primary key (staff_id, service_id)
);
create index staff_services_service_idx on app.staff_services (service_id);

-- ---------------------------------------------------------------- rosters
-- One row per staff member per working day. No row = not working that day.
create table app.shifts (
  shop_id    uuid not null references app.shops(id) on delete cascade,
  staff_id   uuid not null references app.staff(id) on delete cascade,
  date       date not null,
  start_min  int not null check (start_min between 0 and 1440),
  end_min    int not null check (end_min between 0 and 1440),
  breaks     jsonb not null default '[]'::jsonb,
  primary key (staff_id, date),
  check (end_min > start_min)
);
create index shifts_shop_date_idx on app.shifts (shop_id, date);

-- ---------------------------------------------------------------- customers
create table app.customers (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references app.shops(id) on delete cascade,
  name        text not null,
  phone       text,
  phone_norm  text not null default '',
  email       text,
  notes       text,
  blocked     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index customers_phone_key on app.customers (shop_id, phone_norm) where phone_norm <> '';
create index customers_shop_idx on app.customers (shop_id, created_at desc);
create trigger customers_touch before update on app.customers for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------- bookings
create table app.bookings (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references app.shops(id) on delete cascade,
  staff_id        uuid not null references app.staff(id) on delete cascade,
  customer_id     uuid references app.customers(id) on delete set null,
  group_id        uuid,
  code            text not null,
  kind            text not null check (kind in ('online', 'walkin', 'phone', 'block')),
  status          text not null default 'confirmed'
                  check (status in ('confirmed', 'completed', 'no_show', 'cancelled')),
  date            date not null,            -- shop-local date
  start_min       int not null check (start_min between 0 and 1440),
  end_min         int not null check (end_min between 0 and 1440),
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  busy_until      timestamptz not null,     -- ends_at + cleanup buffer
  duration_min    int not null,
  guest_name      text,
  guest_phone     text,
  guest_email     text,
  notes           text,
  internal_note   text,
  photo_url       text,
  any_staff       boolean not null default false,
  est_price_cents int,
  lang            text not null default 'en' check (lang in ('zh', 'en')),
  manage_token    text unique,
  created_by      uuid references app.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  cancelled_at    timestamptz,
  cancelled_by    text check (cancelled_by is null or cancelled_by in ('customer', 'shop')),
  cancel_reason   text,
  reminder_sent_at timestamptz,
  check (end_min > start_min),
  check (ends_at > starts_at and busy_until >= ends_at),
  -- The database itself refuses two active bookings for one staff member that overlap in time.
  constraint bookings_no_overlap exclude using gist (
    staff_id with =,
    tstzrange(starts_at, busy_until, '[)') with &&
  ) where (status in ('confirmed', 'completed'))
);
create index bookings_shop_date_idx on app.bookings (shop_id, date);
create index bookings_staff_date_idx on app.bookings (staff_id, date);
create index bookings_code_idx on app.bookings (shop_id, code);
create index bookings_customer_idx on app.bookings (customer_id, starts_at desc);
create index bookings_group_idx on app.bookings (group_id) where group_id is not null;
create index bookings_reminder_idx on app.bookings (starts_at) where status = 'confirmed' and reminder_sent_at is null;
create trigger bookings_touch before update on app.bookings for each row execute function app.touch_updated_at();

create table app.booking_items (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references app.bookings(id) on delete cascade,
  service_id   uuid references app.services(id) on delete set null,
  kind         text not null check (kind in ('service', 'addon')),
  name         text not null,
  name_zh      text,
  duration_min int not null,
  price_cents  int,
  sort         int not null default 0
);
create index booking_items_booking_idx on app.booking_items (booking_id);
create index booking_items_service_idx on app.booking_items (service_id);

create table app.booking_events (
  id          bigserial primary key,
  booking_id  uuid not null references app.bookings(id) on delete cascade,
  at          timestamptz not null default now(),
  actor       text not null check (actor in ('customer', 'shop', 'system')),
  actor_user  uuid references app.users(id) on delete set null,
  action      text not null,
  detail      jsonb not null default '{}'::jsonb
);
create index booking_events_booking_idx on app.booking_events (booking_id, at);

-- ---------------------------------------------------------------- email log + rate limiting
create table app.email_log (
  id          bigserial primary key,
  shop_id     uuid references app.shops(id) on delete cascade,
  booking_id  uuid references app.bookings(id) on delete set null,
  to_email    text not null,
  template    text not null,
  subject     text not null,
  status      text not null check (status in ('sent', 'failed', 'skipped')),
  provider_id text,
  error       text,
  created_at  timestamptz not null default now()
);
create index email_log_shop_idx on app.email_log (shop_id, created_at desc);

create table app.rate_events (
  id   bigserial primary key,
  key  text not null,
  at   timestamptz not null default now()
);
create index rate_events_key_idx on app.rate_events (key, at);

-- ---------------------------------------------------------------- lock down the Data API
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'app' loop
    execute format('alter table app.%I enable row level security', t.tablename);
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema app from anon, authenticated';
    execute 'revoke all on all tables in schema app from anon, authenticated';
  end if;
end $$;
