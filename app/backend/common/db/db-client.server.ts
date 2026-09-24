import type { Prisma } from "@prisma/client";
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

// Reuse one client across Vite HMR reloads in development.
if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export type TxClient = Prisma.TransactionClient;

/** Either the root client or an open transaction; repositories accept both. */
export type DbClient = PrismaClient | TxClient;

export function withTransaction<T>(
  fn: (tx: TxClient) => Promise<T>,
  options?: { maxWait?: number; timeout?: number },
): Promise<T> {
  return prisma.$transaction(fn, options);
}

export default prisma;
