-- 042_free_pick_fn.sql
--
-- free_pick(kind, id, add): add datasets to a free account's 3 picks in one
-- locked step, so two clicks at once can never add a 4th or swap one out.
--   kind 'profile' → profiles.free_datasets for that user
--   kind 'org'     → organizations.free_datasets for that (free) team
-- Existing picks are kept in order; new ones are appended. Raises
-- 'free_limit' if the result would exceed 3 and 'not_free_team' for a paid
-- team. Service role only: the API validates the slugs and who may pick.
--
-- Applied to prod 2026-09-27 via Supabase MCP.

create or replace function public.free_pick(p_kind text, p_id uuid, p_add text[])
returns text[]
language plpgsql security definer
set search_path = public
as $$
declare
  cur  text[];
  plan text;
  nxt  text[];
begin
  if p_kind = 'profile' then
    select coalesce(free_datasets, '{}') into cur from profiles where id = p_id for update;
    if not found then raise exception 'not_found'; end if;
  elsif p_kind = 'org' then
    select coalesce(free_datasets, '{}'), organizations.plan into cur, plan from organizations where id = p_id for update;
    if not found then raise exception 'not_found'; end if;
    if plan <> 'free' then raise exception 'not_free_team'; end if;
  else
    raise exception 'bad_kind';
  end if;

  nxt := cur || array(select distinct a from unnest(p_add) a where not (a = any(cur)));
  if cardinality(nxt) > 3 then raise exception 'free_limit'; end if;

  if p_kind = 'profile' then
    update profiles set free_datasets = nxt, free_datasets_at = coalesce(free_datasets_at, now()) where id = p_id;
  else
    update organizations set free_datasets = nxt, free_datasets_at = coalesce(free_datasets_at, now()) where id = p_id;
  end if;
  return nxt;
end $$;

revoke all on function public.free_pick(text, uuid, text[]) from public, anon, authenticated;
grant execute on function public.free_pick(text, uuid, text[]) to service_role;
