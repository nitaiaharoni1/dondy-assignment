import type { NormalizedOrder } from "./payload.server";
import prisma from "../db.server";
import { hasOfflineSession } from "./shops.server";
import { normalizeShopDomain } from "./shops.server";

type IngestResult =
  | { status: "accepted" }
  | { status: "duplicate" }
  | { status: "unknown_shop" }
  | { status: "setup_incomplete" };

const TX_MAX_WAIT_MS = 500;
const TX_TIMEOUT_MS = 1000;

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Shop row missing: offline Session still present means install is mid-flight
 * (setup_incomplete). No Session means we never registered this shop (unknown_shop).
 */
async function missingShop(tx: Tx, shop: string): Promise<IngestResult> {
  if (await hasOfflineSession(tx, shop)) {
    return { status: "setup_incomplete" };
  }
  return { status: "unknown_shop" };
}

/**
 * Receipt and order commit in one transaction. Upsert update is empty so the
 * first accepted snapshot wins; a later webhook for the same orderId is a no-op.
 */
async function saveOrder(
  tx: Tx,
  shop: string,
  input: {
    webhookId: string;
    topic: string;
    order: NormalizedOrder;
  },
): Promise<IngestResult> {
  await tx.webhookReceipt.create({
    data: {
      shop,
      webhookId: input.webhookId,
      topic: input.topic,
    },
  });

  await tx.order.upsert({
    where: {
      shop_orderId: {
        shop,
        orderId: input.order.orderId,
      },
    },
    create: {
      shop,
      orderId: input.order.orderId,
      name: input.order.name,
      totalMinor: input.order.totalMinor,
      currency: input.order.currency,
      gateways: input.order.gateways,
      createdAt: input.order.createdAt,
      isCod: input.order.isCod,
    },
    update: {},
  });

  return { status: "accepted" };
}

/**
 * After a write failure, treat an existing receipt as a duplicate outcome.
 * Covers unique races (P2002) and SQLite busy/timeouts once the winner committed.
 */
async function duplicateIfReceiptExists(
  shop: string,
  webhookId: string,
): Promise<IngestResult | null> {
  const existing = await prisma.webhookReceipt.findUnique({
    where: {
      shop_webhookId: {
        shop,
        webhookId,
      },
    },
    select: { webhookId: true },
  });
  if (!existing) {
    return null;
  }
  return { status: "duplicate" };
}

/**
 * Persist an orders/create delivery. Duplicate webhookId (unique race or retry
 * after the winner committed) returns duplicate and leaves the first snapshot.
 */
export async function ingestOrderCreate(input: {
  shop: string;
  webhookId: string;
  topic: string;
  order: NormalizedOrder;
}): Promise<IngestResult> {
  const shop = normalizeShopDomain(input.shop);
  try {
    return await prisma.$transaction(
      async (tx) => {
        const shopRow = await tx.shop.findUnique({
          where: { domain: shop },
          select: { domain: true },
        });
        if (!shopRow) {
          return missingShop(tx, shop);
        }
        return saveOrder(tx, shop, input);
      },
      {
        maxWait: TX_MAX_WAIT_MS,
        timeout: TX_TIMEOUT_MS,
      },
    );
  } catch (error) {
    const duplicate = await duplicateIfReceiptExists(shop, input.webhookId);
    if (duplicate) {
      return duplicate;
    }
    throw error;
  }
}
