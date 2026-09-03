#!/bin/sh
# DeeYoung Pro — Railway boot sequence (resilient by design).
#
# 1. HOSTNAME=0.0.0.0 — CRITICAL FIX. Next.js standalone picks its BIND ADDRESS
#    from process.env.HOSTNAME (server.js: `process.env.HOSTNAME || '0.0.0.0'`).
#    Railway containers set HOSTNAME to the container ID, which does NOT resolve
#    inside the container network → getaddrinfo ENOTFOUND → the server exits at
#    boot → crash loop → "Application failed to respond". Forcing 0.0.0.0 binds
#    all interfaces so Railway's edge proxy can always reach the app.
# 2. Schema push is NON-FATAL (60s timeout): a missing/unreachable database
#    must never stop the server from booting — /api/health reports exact
#    diagnostics (env presence booleans + per-source states) instead.
# 3. exec node = the server replaces this shell (PID 1, proper signal handling).

export HOSTNAME=0.0.0.0

echo "[start] DeeYoung Pro boot — PORT=${PORT:-3000} HOSTNAME=${HOSTNAME}"
echo "[start] env presence: DATABASE_URL=$([ -n "$DATABASE_URL" ] && echo yes || echo NO) BETTER_AUTH_SECRET=$([ -n "$BETTER_AUTH_SECRET" ] && echo yes || echo NO) BETTER_AUTH_URL=$([ -n "$BETTER_AUTH_URL" ] && echo yes || echo NO) APP_SECRET=$([ -n "$APP_SECRET" ] && echo yes || echo NO) ADMIN_EMAILS=$([ -n "$ADMIN_EMAILS" ] && echo yes || echo NO) AGENTMAIL_API_KEY=$([ -n "$AGENTMAIL_API_KEY" ] && echo yes || echo NO)"

echo "[start] applying Prisma schema (postgres)..."
timeout 60 ./node_modules/.bin/prisma db push --accept-data-loss --schema prisma/schema.postgres.prisma \
  || echo "[start] WARNING: db push failed or timed out — booting server anyway (see /api/health)"

echo "[start] launching server..."
exec node .next/standalone/server.js
