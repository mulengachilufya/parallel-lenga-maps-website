-- 028_handle_new_user_signup_fields.sql
--
-- Extends the signup trigger so the new structured identity fields captured on
-- /signup (first_name, last_name, country, sector) are written into the
-- profiles row atomically at account-creation time. Supabase copies
-- signUp({ options: { data }}) into raw_user_meta_data BEFORE this trigger
-- fires, so the values are available here.
--
-- Everything else is preserved exactly as before (plan NULL, plan_status
-- 'free', trial_started_at from metadata or now()). nullif(...,'') keeps empty
-- strings out of the columns.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $function$
begin
  insert into public.profiles (
    id, email, full_name, first_name, last_name, country, sector,
    plan, plan_status, trial_started_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'first_name', ''),
    nullif(new.raw_user_meta_data->>'last_name', ''),
    nullif(new.raw_user_meta_data->>'country', ''),
    nullif(new.raw_user_meta_data->>'sector', ''),
    null,
    'free',
    coalesce((new.raw_user_meta_data->>'trial_started_at')::timestamptz, now())
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;
