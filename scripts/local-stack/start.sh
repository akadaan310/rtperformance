#!/usr/bin/env bash
# Starts Postgres + Supabase Auth (GoTrue) + PostgREST + a tiny gateway on http://127.0.0.1:54321.
# Prefer `supabase start` (Docker) when available; this script exists for Docker-free environments.
set -euo pipefail
source "$(dirname "$0")/env.sh"
mkdir -p "$STACK_DIR/bin" "$STACK_DIR/logs"

if [ ! -x "$STACK_DIR/bin/postgrest" ]; then
  echo "Downloading PostgREST $POSTGREST_VERSION"
  curl -fsSL "https://github.com/PostgREST/postgrest/releases/download/$POSTGREST_VERSION/postgrest-$POSTGREST_VERSION-linux-static-x64.tar.xz" | tar -xJ -C "$STACK_DIR/bin"
fi
if [ ! -x "$STACK_DIR/bin/auth/auth" ]; then
  echo "Downloading Supabase Auth $GOTRUE_VERSION"
  mkdir -p "$STACK_DIR/bin/auth"
  curl -fsSL "https://github.com/supabase/auth/releases/download/$GOTRUE_VERSION/auth-$GOTRUE_VERSION-x86.tar.gz" | tar -xz -C "$STACK_DIR/bin/auth"
fi

RUN_AS=""
if [ "$(id -u)" = "0" ]; then RUN_AS="postgres"; fi
pg() { if [ -n "$RUN_AS" ]; then su "$RUN_AS" -s /bin/bash -c "$*"; else bash -c "$*"; fi; }

if [ ! -f "$PG_DATA/PG_VERSION" ]; then
  echo "Initialising Postgres cluster at $PG_DATA"
  mkdir -p "$PG_DATA"; [ -n "$RUN_AS" ] && chown -R "$RUN_AS" "$(dirname "$PG_DATA")"
  pg "$PG_BIN/initdb -D $PG_DATA -U postgres --auth=trust >/dev/null"
  FRESH=1
fi
if ! pg "$PG_BIN/pg_ctl -D $PG_DATA status" >/dev/null 2>&1; then
  pg "$PG_BIN/pg_ctl -D $PG_DATA -o '-p $PG_PORT -k /tmp' -l $PG_DATA/../postgres.log start -w" >/dev/null
fi

if [ "${FRESH:-0}" = "1" ] || ! $PSQL -tAc "select 1 from pg_roles where rolname='authenticator'" | grep -q 1; then
  echo "Creating Supabase-compatible roles"
  $PSQL -f "$(dirname "$0")/bootstrap.sql"
fi

start_bg() { # name, command...
  local name=$1; shift
  if [ -f "$STACK_DIR/$name.pid" ] && kill -0 "$(cat "$STACK_DIR/$name.pid")" 2>/dev/null; then return; fi
  nohup "$@" >"$STACK_DIR/logs/$name.log" 2>&1 &
  echo $! >"$STACK_DIR/$name.pid"
}

export GOTRUE_API_HOST=127.0.0.1 PORT=9999 API_EXTERNAL_URL=http://127.0.0.1:54321/auth/v1 \
  GOTRUE_SITE_URL="${SITE_URL:-http://localhost:3000}" GOTRUE_URI_ALLOW_LIST="http://localhost:3000/**,http://127.0.0.1:3000/**" \
  GOTRUE_DB_DRIVER=postgres GOTRUE_DB_MIGRATIONS_PATH="$STACK_DIR/bin/auth/migrations" \
  GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:postgres@127.0.0.1:$PG_PORT/postgres?search_path=auth&sslmode=disable" \
  GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role \
  GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
  GOTRUE_DISABLE_SIGNUP=false GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=true \
  GOTRUE_SMTP_ADMIN_EMAIL=admin@localhost GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 GOTRUE_LOG_LEVEL=warn
start_bg auth "$STACK_DIR/bin/auth/auth"

export PGRST_DB_URI="postgres://authenticator:postgres@127.0.0.1:$PG_PORT/postgres" PGRST_DB_SCHEMAS=public \
  PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$JWT_SECRET" PGRST_SERVER_PORT=3001 PGRST_SERVER_HOST=127.0.0.1 \
  PGRST_DB_CHANNEL_ENABLED=true PGRST_LOG_LEVEL=warn
start_bg rest "$STACK_DIR/bin/postgrest"
start_bg gateway node "$(dirname "$0")/gateway.mjs"

for i in $(seq 1 30); do
  curl -fs http://127.0.0.1:9999/health >/dev/null 2>&1 && break; sleep 1
done
bash "$(dirname "$0")/migrate.sh"
node "$(dirname "$0")/keys.mjs"
