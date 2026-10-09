#!/usr/bin/env bash
# Destroys the local stack's database and rebuilds it from supabase/migrations. Local development only.
set -euo pipefail
source "$(dirname "$0")/env.sh"
bash "$(dirname "$0")/stop.sh" >/dev/null 2>&1 || true
rm -rf "$PG_DATA"
bash "$(dirname "$0")/start.sh"
