import type { Session } from "@shopify/shopify-api";

import type { TxClient } from "../../common/db/db-client.server";
import { withTransaction } from "../../common/db/db-client.server";
import { createShopIfAbsent } from "./shops-repository.server";
import { deleteSessionsForShop } from "./shops-repository.server";
import { deleteShop } from "./shops-repository.server";
import { hasOfflineSession } from "./shops-repository.server";
import { hasRegisteredOfflineShop } from "./shops-repository.server";
import { shopExists } from "./shops-repository.server";

/** Case-insensitive shop key: trim + lowercase. All shop lookups use this form. */
export function normalizeShopDomain(shopDomain: string): string {
  return shopDomain.trim().toLowerCase();
}

type Registration =
  { ok: true } | { ok: false; reason: "missing_offline_session" };

/**
 * Create the Shop row only after an offline Session exists.
 * Non-.myshopify.com domains are rejected with the same failure reason.
 */
async function registerInstalledShop(
  tx: TxClient,
  domain: string,
): Promise<Registration> {
  if (!(await hasOfflineSession(tx, domain))) {
    return { ok: false, reason: "missing_offline_session" };
  }

  if (!(await shopExists(tx, domain))) {
    await createShopIfAbsent(tx, domain);
  }

  return { ok: true };
}

/**
 * Idempotent installation registration. Preserves installedAt on reauth.
 * Requires a matching offline session row still present in the database.
 */
export async function ensureShopRegistered(
  shopDomain: string,
): Promise<Registration> {
  const domain = normalizeShopDomain(shopDomain);
  if (!domain.endsWith(".myshopify.com")) {
    return { ok: false, reason: "missing_offline_session" };
  }
  if (await hasRegisteredOfflineShop(domain)) {
    return { ok: true };
  }
  return withTransaction((tx) => registerInstalledShop(tx, domain));
}

/** Offline sessions only: online tokens must not create the Shop row. */
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
  await withTransaction(async (tx) => {
    await deleteSessionsForShop(tx, domain);
    await deleteShop(tx, domain);
  });
}
