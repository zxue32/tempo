-- Interactive storefront and staff management:
-- colour palettes (hair colours / nail colours), tagged gallery, client preferences,
-- public technician pages with ratings, and the nail design saved with a booking.

-- Shop-managed colour swatches. kind: 'hair' (dye shades) or 'nail' (polish colours used by the nail designer).
create table app.palette (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references app.shops(id) on delete cascade,
  kind        text not null check (kind in ('hair', 'nail')),
  name        text not null check (length(name) between 1 and 60),
  name_zh     text,
  code        text,                                  -- brand shade number, e.g. "7.1" or "OPI Bubble Bath"
  hex         text not null check (hex ~ '^#[0-9a-fA-F]{6}$'),
  hex2        text check (hex2 ~ '^#[0-9a-fA-F]{6}$'), -- optional second colour (ombre / balayage end)
  photo_url   text,
  sort        int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index palette_shop_idx on app.palette (shop_id, kind, sort);

-- Gallery items can be filtered: tags like {"length":"long","style":["balayage","curly"],"color":"<palette id>"}
alter table app.gallery add column tags jsonb not null default '{}'::jsonb;

-- Structured client preferences the shop keeps (and that the booking flow pre-fills for returning clients)
-- e.g. {"colors":["nude pink"],"shape":"almond","length":"medium","staffId":"…","hair":{"color":"7.1"},"notes":"…"}
alter table app.customers add column preferences jsonb not null default '{}'::jsonb;

-- Public technician page
alter table app.staff
  add column public_page boolean not null default true,
  add column specialties text[] not null default '{}',
  add column specialties_zh text[] not null default '{}';

-- A nail design (from "design your nails") attached to a booking, plus a one-time rating after the visit
alter table app.bookings
  add column design jsonb,
  add column rating smallint check (rating between 1 and 5),
  add column rating_note text,
  add column rated_at timestamptz;
create index bookings_rating_idx on app.bookings (staff_id) where rating is not null;

alter table app.palette enable row level security;
