-- 028 defines the profile function. Install the auth trigger on a new project.
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Give the server the grants required by existing route handlers, including
-- projects created on Supabase with automatic Data API grants disabled.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function public.workspace_snapshot(uuid), public.workspace_commit(uuid, uuid, text, text, text),
  public.workspace_restore(uuid, integer, uuid, text), public.ops_log(text, text, text, text, text, jsonb) to service_role;
grant select on public.workspace_projects, public.workspace_layers, public.workspace_bookmarks,
  public.workspace_messages, public.workspace_revisions, public.workspace_project_members,
  public.workspace_direct_messages to authenticated;
