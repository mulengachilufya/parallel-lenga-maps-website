#!/usr/bin/env bash
# Streams the complete schema for an empty Supabase project as an ordered SQL
# script. Full filenames preserve both historical 048 and 049 migrations.
set -euo pipefail
export LC_ALL=C
cd "$(dirname "$0")/.."
for file in supabase/bootstrap/application.sql scripts/aquifer_migration.sql scripts/lulc_migration.sql supabase/migrations/*.sql supabase/bootstrap/finish.sql; do
  printf '\n\\echo Applying %s\n' "$file"
  cat "$file"
  printf '\n'
done
