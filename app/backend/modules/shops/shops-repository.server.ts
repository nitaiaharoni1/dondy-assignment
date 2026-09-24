import type { DbClient } from "../../common/db/db-client.server";
import type { TxClient } from "../../common/db/db-client.server";
import prisma from "../../common/db/db-client.server";

/**
 * Offline Session present for this domain (SQL lower match). Used to tell
 * unknown_shop apart from setup_incomplete when the Shop row is missing.
 */
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

export async function shopExists(
  db: DbClient,
  domain: string,
): Promise<boolean> {
  const shop = await db.shop.findUnique({
    where: { domain },
    select: { domain: true },
  });
  return shop !== null;
}

/** Shop row and a matching offline Session both exist, in one query. */
export async function hasRegisteredOfflineShop(
  domain: string,
): Promise<boolean> {
  const shops = await prisma.$queryRaw<Array<{ domain: string }>>`
    SELECT "Shop"."domain"
    FROM "Shop"
    INNER JOIN "Session"
      ON lower("Session"."shop") = "Shop"."domain"
      AND "Session"."isOnline" = 0
    WHERE "Shop"."domain" = ${domain}
    LIMIT 1
  `;
  return shops.length > 0;
}

/** update: {} keeps installedAt on reauth. */
export async function createShopIfAbsent(
  tx: TxClient,
  domain: string,
): Promise<void> {
  await tx.shop.upsert({
    where: { domain },
    create: { domain },
    update: {},
  });
}

export async function deleteSessionsForShop(
  tx: TxClient,
  domain: string,
): Promise<void> {
  await tx.$executeRaw`
    DELETE FROM "Session" WHERE lower("shop") = ${domain}
  `;
}

/** Orders and receipts cascade with the Shop row. */
export async function deleteShop(tx: TxClient, domain: string): Promise<void> {
  await tx.$executeRaw`
    DELETE FROM "Shop" WHERE "domain" = ${domain}
  `;
}
