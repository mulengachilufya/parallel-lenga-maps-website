# Self-service: replacing dataset files

How to refresh per-country GIS data **without** asking Claude (or anyone
else) to do it for you. Same workflow Claude uses; same outputs.

## TL;DR — the rivers example

You got a ZIP of per-country `*_rivers.gpkg` files (Natural Earth or
similar). You want each to replace what's currently on `dashboard?section=rivers`.

```bash
# 1. Extract the ZIP into ~/Downloads so the files sit there as
#    Zambia_rivers.gpkg, Kenya_rivers.gpkg, etc.

# 2. From the project root:
node scripts/seed-rivers-from-zip.mjs --country Zambia       # one country
node scripts/seed-rivers-from-zip.mjs --all                  # all of them
node scripts/seed-rivers-from-zip.mjs --all --purge-missing  # ...and drop any
                                                             # countries not in
                                                             # the new file set
```

That's it. The script:

1. Uploads each `.gpkg` to R2 at
   `datasets/{iso3}/rivers/{Country}_rivers.gpkg`
2. Deletes the old row in `hydrology_layers` for that country
   (layer_type='rivers') — handles the shapefile-ZIP → GeoPackage
   format swap cleanly
3. Inserts a fresh row with `file_format='GeoPackage'`,
   `source='Natural Earth — Rivers (1:10m, significant)'`

Re-running is safe (idempotent). Each country invocation replaces in
place.

## What you need

- `.env.local` in the project root with the six keys the script reads
  (look at `scripts/seed-rivers-from-zip.mjs` header for the list)
- The country-name → ISO3 mapping inside the script — already covers
  all 44 file stems Natural Earth uses

## Adding a new dataset (template)

If you want to do the same trick for, say, lakes or aquifers, copy
`scripts/seed-rivers-from-zip.mjs` to `seed-lakes-from-zip.mjs` and
change three things:

1. The `FILENAME_TO_COUNTRY` map's filename stems if the source uses
   different country names
2. `SOURCE_LABEL`, `FILE_FORMAT`, and `layer_type='rivers'` to match
   the new dataset
3. The destination table — `hydrology_layers` is what rivers/lakes
   share; aquifer/population/etc. each have their own table

## Where to see who's on what plan

Open `https://lengamaps.com/admin/users` while signed in with an admin
email (the address must be in the `ADMIN_EMAILS` env var on Vercel —
comma-separated).

That page joins `auth.users` with `profiles` and shows:

- Email + name
- Account type (student / professional / business)
- Plan (basic / pro / max) + status (active / pending / free / expired)
- Plan expiry + days remaining
- Account signup date

It also has tabs (Active / Pending / Free / Expired) and a search box
so you can find a customer fast without writing SQL.

## SQL fallback

If you ever just want the raw query, paste this into Supabase SQL Editor:

```sql
select
  u.email,
  p.full_name,
  p.account_type,
  p.plan,
  p.plan_status,
  p.plan_expires_at,
  p.created_at,
  case
    when p.plan_status != 'active' then p.plan_status
    when p.plan_expires_at is null then 'active'
    when p.plan_expires_at > now() then 'active'
    else 'expired'
  end as effective_status
from profiles p
join auth.users u on u.id = p.id
order by p.created_at desc;
```

That's the same query `/admin/users` runs under the hood.

## Troubleshooting

| Symptom | What to check |
|---|---|
| `R2 ERROR: ...` from the seeder | Wrong R2 credentials in `.env.local`, or the bucket name doesn't match |
| `DB DELETE ERROR / DB INSERT ERROR` | Your service role key is wrong, or you're trying to write to a table the migration hasn't created yet |
| `Unknown country "X"` | The script's `FILENAME_TO_COUNTRY` map doesn't have an entry for that name. Add one with the canonical display name + ISO-3 code |
| `/admin/users` shows "Not authorised" | Your email isn't in `ADMIN_EMAILS` on Vercel. Add it, redeploy |
