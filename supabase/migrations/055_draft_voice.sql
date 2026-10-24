-- 055_draft_voice.sql
-- Each first email is written for one sender: the founder or a staff member
-- (Wiza). The Drafts tab shows each person their own; the pipeline itself
-- (accounts, stages, LinkedIn progress) stays shared.
alter table sales_drafts add column if not exists voice text not null default 'founder'
  check (voice in ('founder', 'staff'));
create index if not exists sales_drafts_voice_idx on sales_drafts (voice, status);
