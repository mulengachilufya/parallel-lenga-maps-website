-- Lifecycle email state + all-time download counter.
--
-- Three automated emails are driven off these columns:
--   welcome_email_sent_at     — stamped once, the moment a profile is first
--                               created (init-profile). Prevents the welcome
--                               mail re-firing when init-profile runs again
--                               after email confirmation.
--   trial_ended_email_sent_at — stamped by the daily lifecycle cron when a
--                               user's 72h trial lapses without converting.
--   nudge_email_sent_at       — stamped by the daily lifecycle cron when an
--                               active subscriber who has never downloaded a
--                               dataset gets the "want ideas?" nudge.
--
-- downloads_used is an all-time download counter for EVERY user (trial and
-- paid). trial_downloads_used (migration 016) only counts trial usage and
-- is left untouched for the trial cap; downloads_used additionally counts
-- paid downloads so the dormant-subscriber nudge can find subscribers who
-- have downloaded exactly zero datasets.

alter table profiles
  add column if not exists welcome_email_sent_at     timestamptz,
  add column if not exists trial_ended_email_sent_at timestamptz,
  add column if not exists nudge_email_sent_at        timestamptz,
  add column if not exists downloads_used             integer not null default 0;

comment on column profiles.downloads_used is
  'All-time dataset download count across trial AND paid usage. Used by the dormant-subscriber nudge to find active subscribers who have never downloaded. Distinct from trial_downloads_used, which only gates the trial cap.';
