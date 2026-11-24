-- Minimal Supabase platform contract for isolated PostgreSQL CI. A real
-- Supabase project already provides these roles, schemas and functions.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.role() returns text language sql stable as $$ select current_user::text $$;
grant usage on schema auth to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:greatest(0, cardinality(string_to_array(name, '/')) - 1)]
$$;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert on storage.objects to authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
create function public.rls_auto_enable() returns event_trigger language plpgsql as $$ begin end $$;
