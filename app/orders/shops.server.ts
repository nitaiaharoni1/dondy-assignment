import type { PrismaClient } from "@prisma/client";
import type { Session } from "@shopify/shopify-api";

import prisma from "../db.server";

type DbClient =
  PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export function normalizeShopDomain(shopDomain: string): string {
  return shopDomain.trim().toLowerCase();
}

export async function hasOfflineSession(
  db: DbClient,
  domain: string,
): Promise<boolean> {
  const sessions = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Session"
    WHERE "isOnline" = 0 AND lower("shop") = ${domain}
    LIMIT 1
  `;
  return sessions.length > 0;
}

type Registration =
  { ok: true } | { ok: false; reason: "missing_offline_session" };

async function registerInstalledShop(
  shopDomain: string,
  db: DbClient,
): Promise<Registration> {
  const domain = normalizeShopDomain(shopDomain);
  if (!domain.endsWith(".myshopify.com")) {
    return { ok: false, reason: "missing_offline_session" };
  }

  if (!(await hasOfflineSession(db, domain))) {
    return { ok: false, reason: "missing_offline_session" };
  }

  await db.shop.upsert({
    where: { domain },
    create: { domain },
    update: {},
  });

  return { ok: true };
}

/**
 * Idempotent installation registration. Preserves installedAt on reauth.
 * Requires a matching offline session row still present in the database.
 */
export async function ensureShopRegistered(
  shopDomain: string,
  db: DbClient = prisma,
): Promise<Registration> {
  if (db === prisma) {
    return prisma.$transaction((tx) => registerInstalledShop(shopDomain, tx));
  }
  return registerInstalledShop(shopDomain, db);
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
  const domain = normalizeShopDomain(shopDomain);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      DELETE FROM "Session" WHERE lower("shop") = ${domain}
    `;
    await tx.$executeRaw`
      DELETE FROM "Shop" WHERE lower("domain") = ${domain}
    `;
  });
}
