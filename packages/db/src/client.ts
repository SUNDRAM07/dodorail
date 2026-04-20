import { PrismaClient } from "@prisma/client";

/**
 * Global singleton pattern for the Prisma client.
 *
 * In serverless (Vercel) environments Next.js may hot-reload modules between
 * requests in dev, which would otherwise instantiate a fresh client every
 * time and exhaust the Neon connection pool. The `globalThis` cache trick is
 * the standard fix.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient };
