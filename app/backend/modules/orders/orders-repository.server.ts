import type { DbClient } from "../../common/db/db-client.server";
import type { TxClient } from "../../common/db/db-client.server";
import prisma from "../../common/db/db-client.server";
import type { NormalizedOrder } from "./domain/domain-payload.server";

const LATEST_ORDER_SELECT = {
  orderId: true,
  name: true,
  createdAt: true,
  totalMinor: true,
  currency: true,
  gateways: true,
  isCod: true,
} as const;

export async function createWebhookReceipt(
  tx: TxClient,
  receipt: { shop: string; webhookId: string; topic: string },
): Promise<void> {
  await tx.webhookReceipt.create({ data: receipt });
}

export async function webhookReceiptExists(
  shop: string,
  webhookId: string,
): Promise<boolean> {
  const existing = await prisma.webhookReceipt.findUnique({
    where: { shop_webhookId: { shop, webhookId } },
    select: { webhookId: true },
  });
  return existing !== null;
}

/** Upsert update is empty so the first accepted snapshot wins. */
export async function createOrderIfAbsent(
  tx: TxClient,
  shop: string,
  order: NormalizedOrder,
): Promise<void> {
  await tx.order.upsert({
    where: { shop_orderId: { shop, orderId: order.orderId } },
    create: {
      shop,
      orderId: order.orderId,
      name: order.name,
      totalMinor: order.totalMinor,
      currency: order.currency,
      gateways: order.gateways,
      createdAt: order.createdAt,
      isCod: order.isCod,
    },
    update: {},
  });
}

export function groupOrdersByCurrencyAndCod(db: DbClient, shop: string) {
  return db.order.groupBy({
    by: ["currency", "isCod"],
    where: { shop },
    _count: { _all: true },
    _sum: { totalMinor: true },
  });
}

export function findLatestOrders(db: DbClient, shop: string, limit: number) {
  return db.order.findMany({
    where: { shop },
    orderBy: [{ createdAt: "desc" }, { orderId: "desc" }],
    take: limit,
    select: LATEST_ORDER_SELECT,
  });
}
