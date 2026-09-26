-- 035_project_voice_notes.sql
--
-- Voice notes move from direct messages to project comments. A comment can
-- now carry a voice note and/or point at one change (revision) in the
-- project history. Direct messages become text-only.
--
--   workspace_messages.voice_path     object in the private `workspace-voice`
--                                     bucket: <org>/<project>/<uuid>.<ext>.
--                                     Read by the service role only; the API
--                                     hands project members 10-minute signed
--                                     URLs after checking the project's org.
--   workspace_messages.voice_seconds  1-300.
--   workspace_messages.revision_seq   the change this comment is about.
--   body may be empty when a voice note is attached.
--
-- Applied to prod 2026-09-26 via Supabase MCP.

alter table workspace_messages
  add column if not exists voice_path    text,
  add column if not exists voice_seconds integer check (voice_seconds is null or voice_seconds between 1 and 300),
  add column if not exists revision_seq  integer check (revision_seq is null or revision_seq > 0);

alter table workspace_messages drop constraint if exists workspace_messages_body_check;
alter table workspace_messages add constraint workspace_messages_body_check
  check (char_length(body) <= 4000 and (char_length(body) >= 1 or voice_path is not null));

create index if not exists workspace_messages_revision_idx
  on workspace_messages (project_id, revision_seq) where revision_seq is not null;

-- Direct messages: text only from now on (no voice rows exist yet).
alter table workspace_direct_messages drop constraint if exists workspace_direct_messages_voice_off;
alter table workspace_direct_messages add constraint workspace_direct_messages_voice_off
  check (voice_path is null);
