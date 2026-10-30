-- CRM · what a shop keeps about its clients beyond bookings: tags, birthday, where they came from, marketing
-- consent (separate from booking notifications), a contact log, follow-ups, and email campaigns.
-- Expand only. Rollback at the bottom.

alter table app.customers add column if not exists tags text[] not null default '{}'
  check (array_length(tags, 1) is null or (array_length(tags, 1) <= 20));
alter table app.customers add column if not exists birthday date;
alter table app.customers add column if not exists source text not null default 'online'
  check (source in ('online', 'walkin', 'phone', 'import', 'manual'));
alter table app.customers add column if not exists marketing_consent boolean not null default false;
alter table app.customers add column if not exists marketing_consent_at timestamptz;
alter table app.customers add column if not exists last_contacted_at timestamptz;
-- one-click unsubscribe from campaign emails; random, never derived from the id
alter table app.customers add column if not exists unsubscribe_token text not null default translate(encode(gen_random_bytes(18), 'base64'), '+/', '-_')
  check (length(unsubscribe_token) between 16 and 64);
create unique index if not exists customers_unsubscribe_key on app.customers (unsubscribe_token);
create index if not exists customers_tags_idx on app.customers using gin (tags);

-- the contact log: notes, calls, messages. Free text, shop-only, never emailed.
create table if not exists app.customer_notes (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null,
  customer_id uuid not null,
  author_user uuid references app.users(id) on delete set null,
  kind        text not null check (kind in ('note', 'call', 'message', 'visit')),
  body        text not null check (length(body) between 1 and 2000),
  at          timestamptz not null default now(),
  foreign key (shop_id, customer_id) references app.customers (shop_id, id) on delete cascade
);
create index if not exists customer_notes_idx on app.customer_notes (customer_id, at desc);
alter table app.customer_notes enable row level security;

-- follow-ups the shop decided to do (suggestions are computed, not stored)
create table if not exists app.follow_ups (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null,
  customer_id uuid not null,
  due         date not null,
  reason      text not null check (reason in ('rebook', 'birthday', 'lapsed', 'custom')),
  note        text check (note is null or length(note) <= 500),
  status      text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  created_by  uuid references app.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  done_at     timestamptz,
  foreign key (shop_id, customer_id) references app.customers (shop_id, id) on delete cascade
);
create index if not exists follow_ups_open_idx on app.follow_ups (shop_id, due) where status = 'open';
alter table app.follow_ups enable row level security;

-- email campaigns to a segment of consenting clients
create table if not exists app.campaigns (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references app.shops(id) on delete cascade,
  name       text not null check (length(name) between 1 and 80),
  subject    text not null check (length(subject) between 1 and 120),
  body       text not null check (length(body) between 1 and 4000),
  segment    jsonb not null default '{}'::jsonb check (pg_column_size(segment) <= 2048),
  status     text not null default 'draft' check (status in ('draft', 'sent')),
  created_by uuid references app.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  sent_count int not null default 0,
  unique (shop_id, id)
);
alter table app.campaigns enable row level security;

create table if not exists app.campaign_sends (
  campaign_id uuid not null,
  shop_id     uuid not null,
  customer_id uuid not null,
  email       text not null,
  status      text not null check (status in ('sent', 'failed', 'skipped')),
  at          timestamptz not null default now(),
  primary key (campaign_id, customer_id),
  foreign key (shop_id, campaign_id) references app.campaigns (shop_id, id) on delete cascade,
  foreign key (shop_id, customer_id) references app.customers (shop_id, id) on delete cascade
);
alter table app.campaign_sends enable row level security;

-- how many days after a visit the shop usually wants the client back (nails: about three weeks)
alter table app.shops add column if not exists rebook_days int not null default 21 check (rebook_days between 0 and 365);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on app.customer_notes, app.follow_ups, app.campaigns, app.campaign_sends from anon, authenticated';
  end if;
end $$;

-- Rollback:
--   drop table if exists app.campaign_sends; drop table if exists app.campaigns;
--   drop table if exists app.follow_ups; drop table if exists app.customer_notes;
--   alter table app.shops drop column if exists rebook_days;
--   alter table app.customers drop column if exists unsubscribe_token, drop column if exists last_contacted_at,
--     drop column if exists marketing_consent_at, drop column if exists marketing_consent, drop column if exists source,
--     drop column if exists birthday, drop column if exists tags;
--   delete from app.schema_migrations where name = '0011_crm.sql';
