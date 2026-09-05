import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Schema-upgrade guard: after a prisma generate adds models, a long-lived dev
// process can still hold the OLD client instance in globalThis (HMR keeps the
// singleton). Detect a missing model and rebuild once — no manual restarts.
// v2 of the guard (forces fresh compile after model add).
if (process.env.NODE_ENV !== "production") console.log("[db.ts] module v2 loaded");
function clientIsStale(c: PrismaClient): boolean {
  try {
    return !((c as unknown as Record<string, unknown>).engineControl);
  } catch {
    return true;
  }
}

export const db: PrismaClient =
  globalForPrisma.prisma && !clientIsStale(globalForPrisma.prisma)
    ? globalForPrisma.prisma
    : new PrismaClient({
        // Query logging in dev only — in production (Railway) it spams stdout on
        // every SQL statement and adds per-query serialization overhead.
        log: process.env.NODE_ENV === "production" ? ["error", "warn"] : ["query"],
      })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
// prisma client refresh touch
