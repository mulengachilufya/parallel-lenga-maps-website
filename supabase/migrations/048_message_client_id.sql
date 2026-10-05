-- 048_message_client_id.sql
--
-- Comments and voice notes carry a client_id chosen by the browser, so a
-- send that is retried after a dropped connection is stored once, not twice.
--
-- Applied to prod via Supabase MCP.

alter table workspace_messages add column if not exists client_id uuid;
create unique index if not exists workspace_messages_client_idx
  on workspace_messages (project_id, client_id) where client_id is not null;
