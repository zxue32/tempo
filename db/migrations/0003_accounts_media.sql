-- Built-in accounts (email + password) and photos stored in the database.
-- Replaces the dependency on Supabase Auth, which needs dashboard setup and its own email service.

alter table app.users
  alter column id set default gen_random_uuid(),
  add column password_hash text,
  add column email_verified_at timestamptz,
  -- set only when the account was created with the platform setup code; admin rights need this AND an email in PLATFORM_ADMIN_EMAILS
  add column platform_admin boolean not null default false,
  add column disabled boolean not null default false;

-- one row per signed-in browser; the cookie holds a random token, the database only its SHA-256
create table app.sessions (
  token_hash   text primary key,
  user_id      uuid not null references app.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  user_agent   text
);
create index sessions_user_idx on app.sessions (user_id);
create index sessions_expiry_idx on app.sessions (expires_at);

-- single-use links: password reset (sent by email when available, or made by the platform admin)
create table app.auth_tokens (
  token_hash  text primary key,
  user_id     uuid not null references app.users(id) on delete cascade,
  purpose     text not null check (purpose in ('reset')),
  created_by  uuid references app.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);
create index auth_tokens_user_idx on app.auth_tokens (user_id);

-- uploaded photos when no external storage is configured (served by /media/<path> with long-lived caching)
create table app.media (
  path        text primary key check (path ~ '^[a-z]+/[0-9a-f-]+/[0-9a-f]{32}\.(jpg|png|webp)$'),
  shop_id     uuid references app.shops(id) on delete cascade,
  mime        text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  size        int not null check (size between 1 and 3145728),
  bytes       bytea not null,
  created_at  timestamptz not null default now()
);
create index media_shop_idx on app.media (shop_id);

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
