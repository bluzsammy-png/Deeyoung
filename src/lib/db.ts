import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Query logging in dev only — in production (Railway) it spams stdout on
    // every SQL statement and adds per-query serialization overhead.
    log: process.env.NODE_ENV === "production" ? ["error", "warn"] : ["query"],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db