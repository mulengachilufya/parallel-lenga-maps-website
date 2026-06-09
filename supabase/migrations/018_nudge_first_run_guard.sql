-- First-run guard for the dormant-subscriber nudge.
--
-- The dormant nudge (lifecycle-emails cron) targets active subscribers with
-- downloads_used = 0. But downloads_used was only just added (migration 017)
-- and defaults to 0, so EVERY existing subscriber currently reads as zero,
-- even ones who have been downloading for months (we simply weren't counting
-- yet). Without this guard the very first cron run would email the entire
-- existing subscriber base at once.
--
-- Fix: stamp every currently-active subscriber as already-nudged. They are
-- excluded from the nudge going forward. Anyone who subscribes AFTER this
-- migration starts at downloads_used = 0 with nudge_email_sent_at = NULL and
-- is tracked correctly, so genuinely-new dormant subscribers still get the
-- nudge.
--
-- We also bump their downloads_used to 1 as a belt-and-braces signal (the
-- nudge query checks downloads_used = 0). The counter is only ever used as an
-- is-zero test for the nudge, never shown to users or billed, so a +1 offset
-- on legacy rows is harmless.

update profiles
   set nudge_email_sent_at = now(),
       downloads_used       = greatest(downloads_used, 1)
 where plan_status = 'active';
