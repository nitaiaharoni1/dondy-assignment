import type { PrismaClient } from "@prisma/client";
import type { Session } from "@shopify/shopify-api";

import prisma from "../db.server";

type DbClient =
  PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Idempotent installation registration. Preserves installedAt on reauth.
 * Requires a matching offline session row still present in the database.
 */
export async function ensureShopRegistered(
  shopDomain: string,
  db: DbClient = prisma,
): Promise<{ ok: true } | { ok: false; reason: "missing_offline_session" }> {
  const offlineSession = await db.session.findFirst({
    where: {
      shop: shopDomain,
      isOnline: false,
    },
    select: { id: true },
  });

  if (!offlineSession) {
    return { ok: false, reason: "missing_offline_session" };
  }

  await db.shop.upsert({
    where: { domain: shopDomain },
    create: { domain: shopDomain },
    update: {},
  });

  return { ok: true };
}

export async function registerShopFromSession(session: Session): Promise<void> {
  if (session.isOnline) {
    return;
  }
  await ensureShopRegistered(session.shop);
}

/**
 * Delete sessions and the Shop row (orders/receipts cascade) atomically.
 * Safe when the shop or sessions are already gone.
 */
export async function purgeShopData(shopDomain: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.session.deleteMany({ where: { shop: shopDomain } });
    await tx.shop.deleteMany({ where: { domain: shopDomain } });
  });
}
