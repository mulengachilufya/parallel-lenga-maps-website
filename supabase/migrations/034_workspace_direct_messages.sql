-- 034_workspace_direct_messages.sql
--
-- One-to-one messages between members of the same team, with optional voice
-- notes. Every message shows up in the recipient's workspace inbox (Realtime)
-- and is emailed to them (the API throttles repeat emails while a
-- conversation is live).
--
-- Security model, same as 031:
--   * Reads: only the two people in the conversation (RLS on auth.uid()).
--     Realtime postgres_changes goes through the same policy.
--   * Writes: API routes only, with the service role, after checking both
--     people belong to the same active organization. No write policies.
--   * Voice notes live in the private bucket `workspace-voice`, written and
--     read by the service role only; the API hands out short signed URLs to
--     the two participants.
--
-- Applied to prod 2026-09-26 via Supabase MCP.

create table if not exists workspace_direct_messages (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  sender_id      uuid not null references auth.users(id) on delete cascade,
  recipient_id   uuid not null references auth.users(id) on delete cascade,
  sender_name    text not null,
  body           text check (body is null or char_length(body) between 1 and 4000),
  voice_path     text,
  voice_seconds  integer check (voice_seconds is null or voice_seconds between 1 and 300),
  project_id     uuid references workspace_projects(id) on delete set null,
  created_at     timestamptz not null default now(),
  read_at        timestamptz,
  emailed_at     timestamptz,
  check (sender_id <> recipient_id),
  check (body is not null or voice_path is not null)
);

create index if not exists wdm_recipient_idx on workspace_direct_messages (recipient_id, created_at desc);
create index if not exists wdm_sender_idx    on workspace_direct_messages (sender_id, created_at desc);
create index if not exists wdm_unread_idx    on workspace_direct_messages (recipient_id) where read_at is null;

alter table workspace_direct_messages enable row level security;

drop policy if exists wdm_read on workspace_direct_messages;
create policy wdm_read on workspace_direct_messages
  for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public'
                   and tablename = 'workspace_direct_messages') then
    alter publication supabase_realtime add table public.workspace_direct_messages;
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workspace-voice', 'workspace-voice', false, 4194304,
        array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/x-m4a'])
on conflict (id) do nothing;
