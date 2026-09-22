import { Prisma } from "@prisma/client";

import type { NormalizedOrder } from "../domain/order-payload.server";
import { fromMinorUnits } from "../domain/money";
import prisma from "../db.server";

export type IngestResult =
  | { status: "accepted" }
  | { status: "duplicate" }
  | { status: "unknown_shop" }
  | { status: "setup_incomplete" };

const TX_MAX_WAIT_MS = 500;
const TX_TIMEOUT_MS = 1000;

export async function ingestOrderCreate(input: {
  shop: string;
  webhookId: string;
  topic: string;
  order: NormalizedOrder;
}): Promise<IngestResult> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const shopRow = await tx.shop.findUnique({
          where: { domain: input.shop },
          select: { domain: true },
        });

        if (!shopRow) {
          const offlineSession = await tx.session.findFirst({
            where: { shop: input.shop, isOnline: false },
            select: { id: true },
          });
          if (offlineSession) {
            return { status: "setup_incomplete" } as const;
          }
          return { status: "unknown_shop" } as const;
        }

        await tx.webhookReceipt.create({
          data: {
            shop: input.shop,
            webhookId: input.webhookId,
            topic: input.topic,
          },
        });

        await tx.order.upsert({
          where: {
            shop_orderId: {
              shop: input.shop,
              orderId: input.order.orderId,
            },
          },
          create: {
            shop: input.shop,
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

        return { status: "accepted" } as const;
      },
      {
        maxWait: TX_MAX_WAIT_MS,
        timeout: TX_TIMEOUT_MS,
      },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.webhookReceipt.findUnique({
        where: {
          shop_webhookId: {
            shop: input.shop,
            webhookId: input.webhookId,
          },
        },
        select: { webhookId: true },
      });
      if (existing) {
        return { status: "duplicate" };
      }
    }
    throw error;
  }
}

export type DashboardData = {
  ordersReceived: number;
  codOrders: number;
  codSharePercent: number;
  totalsByCurrency: Array<{ currency: string; amount: string }>;
  latestOrders: Array<{
    id: string;
    name: string;
    createdAt: string;
    total: string;
    currency: string;
    gateways: string[];
    isCod: boolean;
  }>;
  refreshedAt: string;
};

export async function getDashboardForShop(
  shop: string,
): Promise<DashboardData> {
  if (!shop) {
    throw new Error("shop is required");
  }

  return prisma.$transaction(async (tx) => {
    const groups = await tx.order.groupBy({
      by: ["currency", "isCod"],
      where: { shop },
      _count: { _all: true },
      _sum: { totalMinor: true },
    });

    let ordersReceived = 0;
    let codOrders = 0;
    const totals = new Map<string, bigint>();

    for (const group of groups) {
      const count = group._count._all;
      ordersReceived += count;
      if (group.isCod) {
        codOrders += count;
      }
      const sum = group._sum.totalMinor ?? 0n;
      totals.set(group.currency, (totals.get(group.currency) ?? 0n) + sum);
    }

    const latest = await tx.order.findMany({
      where: { shop },
      orderBy: [{ createdAt: "desc" }, { orderId: "desc" }],
      take: 20,
    });

    const codSharePercent =
      ordersReceived === 0
        ? 0
        : Math.round((1000 * codOrders) / ordersReceived) / 10;

    return {
      ordersReceived,
      codOrders,
      codSharePercent,
      totalsByCurrency: [...totals.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, minor]) => ({
          currency,
          amount: fromMinorUnits(minor, currency),
        })),
      latestOrders: latest.map((row) => ({
        id: row.orderId,
        name: row.name,
        createdAt: row.createdAt.toISOString(),
        total: fromMinorUnits(row.totalMinor, row.currency),
        currency: row.currency,
        gateways: Array.isArray(row.gateways) ? (row.gateways as string[]) : [],
        isCod: row.isCod,
      })),
      refreshedAt: new Date().toISOString(),
    };
  });
}
