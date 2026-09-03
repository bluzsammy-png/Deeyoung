#!/bin/sh
# DeeYoung Pro — Railway boot sequence (resilient by design).
#
# Boot order: schema push (NON-FATAL) → standalone server (exec = PID 1).
#
# Why: the old startCommand (`prisma db push ... && node server.js`) refused to
# boot whenever DATABASE_URL was missing or unreachable — the server never came
# up and Railway's edge returned 502 Bad Gateway with no way to diagnose it.
# Here the server ALWAYS boots: the landing page renders and /api/health
# reports exact diagnostics (env presence booleans + per-source states).

echo "[start] applying Prisma schema (postgres)..."
timeout 60 ./node_modules/.bin/prisma db push --accept-data-loss --schema prisma/schema.postgres.prisma \
  || echo "[start] WARNING: db push failed or timed out — booting server anyway (see /api/health)"

echo "[start] launching DeeYoung Pro on port ${PORT:-3000}..."
exec node .next/standalone/server.js
