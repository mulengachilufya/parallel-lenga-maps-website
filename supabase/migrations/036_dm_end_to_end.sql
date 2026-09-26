-- 036_dm_end_to_end.sql
--
-- Direct messages become end-to-end encrypted. The server stores only
-- ciphertext; it cannot read a message, and neither can anyone with
-- database or dashboard access. See src/lib/workspace/e2e.ts for the scheme.
--
--   workspace_user_keys   one active ECDH P-256 identity per person, plus
--                         retired ones (so older messages from a teammate
--                         who reset still show as "can't be read" rather
--                         than vanishing). public_jwk is public;
--                         wrapped_private is AES-GCM encrypted under a key
--                         derived from the person's passphrase, which the
--                         server never sees. No RLS read policy: served only
--                         through the API (own wrapped key; teammates'
--                         public keys).
--   workspace_dm_nudges   "X wants to message you securely" email throttle.
--   workspace_direct_messages: body is gone (always null); ciphertext, iv
--                         and the two key ids are required. No messages
--                         existed before this migration.
--
-- Applied to prod 2026-09-26 via Supabase MCP.

create table if not exists workspace_user_keys (
  key_id          uuid primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  public_jwk      jsonb not null,
  wrapped_private text not null,
  salt            text not null,
  iv              text not null,
  iterations      integer not null check (iterations >= 100000),
  created_at      timestamptz not null default now(),
  retired_at      timestamptz
);
create unique index if not exists workspace_user_keys_active
  on workspace_user_keys (user_id) where retired_at is null;
alter table workspace_user_keys enable row level security;

create table if not exists workspace_dm_nudges (
  recipient_id uuid primary key references auth.users(id) on delete cascade,
  sent_at      timestamptz not null default now()
);
alter table workspace_dm_nudges enable row level security;

alter table workspace_direct_messages
  add column if not exists ciphertext       text,
  add column if not exists iv               text,
  add column if not exists sender_key_id    uuid references workspace_user_keys(key_id),
  add column if not exists recipient_key_id uuid references workspace_user_keys(key_id);

alter table workspace_direct_messages drop constraint if exists workspace_direct_messages_check1;
alter table workspace_direct_messages drop constraint if exists workspace_direct_messages_e2e;
alter table workspace_direct_messages add constraint workspace_direct_messages_e2e check (
  body is null and ciphertext is not null and iv is not null
  and sender_key_id is not null and recipient_key_id is not null
  and char_length(ciphertext) <= 24000
);
