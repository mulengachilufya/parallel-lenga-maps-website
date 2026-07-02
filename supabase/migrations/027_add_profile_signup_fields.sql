-- 027_add_profile_signup_fields.sql
--
-- Signup used to collect a single `full_name`, which made it impossible to
-- know exactly who is behind a manual payment. This adds structured identity
-- fields captured at signup:
--
--   first_name / last_name — split name (both required in the UI)
--   country                — picked from a dropdown (all countries), not typed
--   sector                 — one of a short fixed taxonomy (see src/lib/sectors.ts)
--
-- All nullable + additive so existing rows and the handle_new_user trigger are
-- untouched. `full_name` is kept and still populated (first + last) for
-- backward compatibility with everything that already reads it.
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name  text,
  add column if not exists country    text,
  add column if not exists sector     text;
