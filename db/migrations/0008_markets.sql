-- CORE-03 · Markets, currency and phone numbers. Expand step only: new columns with defaults that describe
-- every existing shop exactly (they are all US dollar shops), nothing dropped or renamed. Rollback at the bottom.
-- Money columns keep their names: `price_cents` / `est_price_cents` hold minor units of the shop's currency.

-- 1 · each shop trades in one market and settles in one of that market's currencies ----------------------------
alter table app.shops add column if not exists market_key text not null default 'us'
  check (market_key in ('us', 'jp', 'cn'));
alter table app.shops add column if not exists currency text not null default 'USD'
  check (currency in ('USD', 'JPY', 'CNY'));
alter table app.shops drop constraint if exists shops_market_currency;
alter table app.shops add constraint shops_market_currency
  check ((market_key, currency) in (('us', 'USD'), ('jp', 'JPY'), ('cn', 'CNY')));

-- 2 · customers keep what they typed (`phone`), the matching key (`phone_norm`, unchanged for US numbers)
--     and, when the region is certain, the international form ------------------------------------------------
alter table app.customers add column if not exists phone_e164 text
  check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$');

-- backfill only what is certain: a 10-digit North American number in a US shop, or a number typed with its own
-- "+country code" whose stored key already is those digits. Anything else stays empty rather than guessed.
update app.customers c set phone_e164 = '+1' || c.phone_norm
  from app.shops s
  where s.id = c.shop_id and s.market_key = 'us' and c.phone_e164 is null
    and c.phone_norm ~ '^[2-9][0-9]{2}[2-9][0-9]{6}$';
update app.customers set phone_e164 = '+' || phone_norm
  where phone_e164 is null and phone ~ '^\s*\+' and phone_norm ~ '^[1-9][0-9]{7,14}$' and phone_norm !~ '^1';

-- Rollback (safe while no shop uses another market):
--   alter table app.customers drop column if exists phone_e164;
--   alter table app.shops drop constraint if exists shops_market_currency;
--   alter table app.shops drop column if exists currency;
--   alter table app.shops drop column if exists market_key;
--   delete from app.schema_migrations where name = '0008_markets.sql';
