-- Depth release: the shop's real rules, measured durations, confirmations, waitlist, gallery and pilot evidence.

-- ---------------------------------------------------------------- shop rules
alter table app.shops
  -- online bookings must leave at least this many on-shift technicians free (for walk-ins)
  add column walkin_reserve int not null default 0 check (walkin_reserve between 0 and 50),
  -- "any technician": balance booked minutes, or rotate by turns like a turn sheet
  add column assign_mode text not null default 'balanced' check (assign_mode in ('balanced', 'turns')),
  add column turns_count_requests boolean not null default true,
  -- hide online start times that would leave a gap shorter than this (0 = off)
  add column min_gap int not null default 0 check (min_gap between 0 and 120),
  -- after this many no-shows a client must book through the shop (0 = off)
  add column noshow_limit int not null default 0 check (noshow_limit between 0 and 20),
  add column waitlist_enabled boolean not null default true,
  add column pilot_baseline jsonb not null default '{}'::jsonb;

-- equipment that limits how many services can run at once (pedicure chairs, sinks, dryers...)
create table app.resources (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references app.shops(id) on delete cascade,
  name        text not null check (length(name) between 1 and 60),
  name_zh     text,
  quantity    int not null check (quantity between 1 and 100),
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index resources_shop_idx on app.resources (shop_id, sort);

alter table app.services
  add column resource_id uuid references app.resources(id) on delete set null,
  -- add-ons asked as a yes/no question in the booking flow ("Do you have gel on now?")
  add column question_en text,
  add column question_zh text;

alter table app.bookings
  -- equipment held for the whole visit (snapshot taken when the booking is made or its services change)
  add column resource_ids uuid[] not null default '{}',
  -- measured by staff tapping start / finish
  add column actual_start timestamptz,
  add column actual_end timestamptz,
  -- client tapped "I'll be there"
  add column client_confirmed_at timestamptz;
create index bookings_resources_idx on app.bookings using gin (resource_ids);

-- ---------------------------------------------------------------- gallery
create table app.gallery (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references app.shops(id) on delete cascade,
  url         text not null,
  caption_en  text,
  caption_zh  text,
  staff_id    uuid references app.staff(id) on delete set null,
  service_id  uuid references app.services(id) on delete set null,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index gallery_shop_idx on app.gallery (shop_id, sort, created_at desc);

-- ---------------------------------------------------------------- waitlist
create table app.waitlist (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references app.shops(id) on delete cascade,
  date         date not null,
  from_min     int not null check (from_min between 0 and 1440),
  to_min       int not null check (to_min between 0 and 1440 and to_min > from_min),
  service_ids  uuid[] not null,
  addon_ids    uuid[] not null default '{}',
  staff_id     uuid references app.staff(id) on delete set null,
  name         text not null,
  phone        text,
  email        text not null,
  lang         text not null default 'en' check (lang in ('zh', 'en')),
  status       text not null default 'waiting' check (status in ('waiting', 'notified', 'booked', 'removed')),
  notified_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index waitlist_shop_date_idx on app.waitlist (shop_id, date) where status = 'waiting';

-- ---------------------------------------------------------------- pilot evidence
-- one row per anonymous booking-page visit and the furthest steps it reached
create table app.funnel_events (
  shop_id  uuid not null references app.shops(id) on delete cascade,
  session  text not null,
  step     text not null check (step in ('store', 'start', 'time', 'details', 'booked')),
  at       timestamptz not null default now(),
  primary key (shop_id, session, step)
);
create index funnel_events_at_idx on app.funnel_events (shop_id, at);

create table app.integrity_runs (
  id      bigserial primary key,
  shop_id uuid references app.shops(id) on delete cascade,
  at      timestamptz not null default now(),
  ok      boolean not null,
  issues  jsonb not null default '[]'::jsonb
);
create index integrity_runs_idx on app.integrity_runs (shop_id, at desc);

-- ---------------------------------------------------------------- lock down new tables like the rest
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'app' loop
    execute format('alter table app.%I enable row level security', t.tablename);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema app from anon, authenticated';
  end if;
end $$;
