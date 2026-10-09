#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/env.sh"
for n in gateway rest auth; do
  if [ -f "$STACK_DIR/$n.pid" ]; then kill "$(cat "$STACK_DIR/$n.pid")" 2>/dev/null || true; rm -f "$STACK_DIR/$n.pid"; fi
done
RUN_AS=""; [ "$(id -u)" = "0" ] && RUN_AS="postgres"
if [ -n "$RUN_AS" ]; then su "$RUN_AS" -s /bin/bash -c "$PG_BIN/pg_ctl -D $PG_DATA stop -m fast" || true
else "$PG_BIN/pg_ctl" -D "$PG_DATA" stop -m fast || true; fi
