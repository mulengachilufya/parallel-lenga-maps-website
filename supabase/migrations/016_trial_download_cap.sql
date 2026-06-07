-- Trial download cap.
--
-- Until now the 3-day trial gave unlimited downloads. In practice that
-- means a power user signs up, downloads every dataset they want, and
-- never converts — the trial pays out before the funnel even tries to.
--
-- Add a counter so the server can enforce a cap. Default 10 downloads.
-- That's enough to evaluate the platform (sample a few continents, try a
-- raster vs a vector, open a QML), not enough to drain the catalogue.
--
-- The cap is enforced server-side at the dataset-access layer. UI surfaces
-- the remaining count on the dashboard trial banner.

alter table profiles
  add column if not exists trial_downloads_used integer not null default 0;

comment on column profiles.trial_downloads_used is
  'Number of dataset downloads consumed during this account''s free trial. Compared against TRIAL_DOWNLOAD_CAP in src/lib/pricing.ts; downloads stop being granted when used >= cap. Paid subscriptions ignore this column.';
