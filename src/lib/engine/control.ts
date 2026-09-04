// DEEYOUNG PRO — runtime engine control (DB-backed singleton).
// The admin console flips this row; the runner reads it once per cycle.
// Semantics: paused blocks NEW entries only — open positions always keep
// being managed to their stops/targets/time exits. Nothing is ever faked:
// the flag is a real row a real admin action wrote, and every change is
// audit-logged by the API layer that calls setEnginePaused.
//
// Implementation note: raw SQL instead of the generated accessor. Long-lived
// dev servers can hold a Prisma client instance generated BEFORE this model
// existed (Turbopack dep cache); raw queries work against any instance and
// both dialects (sandbox SQLite / Railway Postgres). Same table, same rows.

import { db } from "@/lib/db";

const SINGLETON = "singleton";

const isPg = process.env.DATABASE_URL?.startsWith("postgres") ?? false;

export interface EngineControlState {
  paused: boolean;
  reason: string | null;
  updatedBy: string | null;
  updatedAt: Date | null;
}

interface RawRow {
  paused: number | boolean;
  reason: string | null;
  updatedBy: string | null;
  updatedAt: Date | string | null;
}

export async function getEngineControl(): Promise<EngineControlState> {
  const sql = isPg
    ? `SELECT paused, reason, "updatedBy" AS "updatedBy", "updatedAt" AS "updatedAt" FROM "EngineControl" WHERE id = '${SINGLETON}' LIMIT 1`
    : `SELECT paused, reason, updatedBy, updatedAt FROM EngineControl WHERE id = '${SINGLETON}' LIMIT 1`;
  const rows = (await db.$queryRawUnsafe(sql)) as RawRow[];
  const r = rows?.[0];
  return {
    paused: Boolean(r?.paused),
    reason: r?.reason ?? null,
    updatedBy: r?.updatedBy ?? null,
    updatedAt: r?.updatedAt ? new Date(r.updatedAt) : null,
  };
}

export async function setEnginePaused(paused: boolean, reason: string | null, updatedBy: string): Promise<EngineControlState> {
  const esc = (s: string) => s.replace(/'/g, "''");
  const reasonLit = reason === null ? "NULL" : `'${esc(reason)}'`;
  const byLit = `'${esc(updatedBy)}'`;

  const upsert = isPg
    ? `INSERT INTO "EngineControl" (id, paused, reason, "updatedBy", "updatedAt") VALUES ('${SINGLETON}', ${paused}, ${reasonLit}, ${byLit}, CURRENT_TIMESTAMP) ON CONFLICT (id) DO UPDATE SET paused = ${paused}, reason = ${reasonLit}, "updatedBy" = ${byLit}, "updatedAt" = CURRENT_TIMESTAMP`
    : `INSERT INTO EngineControl (id, paused, reason, updatedBy, updatedAt) VALUES ('${SINGLETON}', ${paused}, ${reasonLit}, ${byLit}, CURRENT_TIMESTAMP) ON CONFLICT (id) DO UPDATE SET paused = ${paused}, reason = ${reasonLit}, updatedBy = ${byLit}, updatedAt = CURRENT_TIMESTAMP`;

  await db.$executeRawUnsafe(upsert);
  return getEngineControl();
}
