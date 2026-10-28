-- More kinds of appointment shops: hair salons, massage & spa, lashes & beauty, tattoo, pet grooming,
-- pilates, personal training and any other appointment-based service.
alter table app.shops drop constraint if exists shops_industry_check;
alter table app.shops add constraint shops_industry_check
  check (industry in ('nail', 'hair', 'barber', 'spa', 'beauty', 'tattoo', 'pet', 'pilates', 'fitness', 'both', 'other'));
