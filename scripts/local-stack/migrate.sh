#!/usr/bin/env bash
# Applies supabase/migrations/*.sql in order, once each, then reloads the PostgREST schema cache.
set -euo pipefail
source "$(dirname "$0")/env.sh"
$PSQL -c "create table if not exists public._local_migrations (version text primary key, applied_at timestamptz default now()); revoke all on public._local_migrations from anon, authenticated;"
for f in "$ROOT"/supabase/migrations/*.sql; do
  v=$(basename "$f" .sql)
  if [ -z "$($PSQL -tAc "select 1 from public._local_migrations where version='$v'")" ]; then
    echo "applying $v"
    $PSQL -1 -f "$f"
    $PSQL -c "insert into public._local_migrations(version) values ('$v')"
  fi
done
$PSQL -c "notify pgrst, 'reload schema'"
