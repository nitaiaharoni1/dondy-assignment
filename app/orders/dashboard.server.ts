import { fromMinorUnits } from "./money";
import prisma from "../db.server";
import { normalizeShopDomain } from "./shops.server";

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

const LATEST_ORDER_LIMIT = 20;

/** One decimal place, half-up via integer math (e.g. 1/3 -> 33.3). */
function codShare(ordersReceived: number, codOrders: number): number {
  if (ordersReceived === 0) {
    return 0;
  }
  return Math.round((1000 * codOrders) / ordersReceived) / 10;
}

/** Prisma Json column: only keep string entries for the UI. */
function gatewayNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

type OrderGroup = {
  currency: string;
  isCod: boolean;
  _count: { _all: number };
  _sum: { totalMinor: bigint | null };
};

/**
 * Flatten groupBy(currency, isCod) into counts and per-currency minor sums.
 * Totals include every accepted order, COD and non-COD alike.
 */
function foldGroups(groups: OrderGroup[]): {
  ordersReceived: number;
  codOrders: number;
  totals: Map<string, bigint>;
} {
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
  return { ordersReceived, codOrders, totals };
}

/**
 * Metrics for one installation. Shop domain is normalized lower-case so it
 * matches the keys written by webhook ingest.
 */
export async function getDashboardForShop(
  shop: string,
): Promise<DashboardData> {
  const domain = normalizeShopDomain(shop);
  if (!domain) {
    throw new Error("shop is required");
  }

  return prisma.$transaction(async (tx) => {
    const groups = await tx.order.groupBy({
      by: ["currency", "isCod"],
      where: { shop: domain },
      _count: { _all: true },
      _sum: { totalMinor: true },
    });
    const summary = foldGroups(groups);

    const latest = await tx.order.findMany({
      where: { shop: domain },
      orderBy: [{ createdAt: "desc" }, { orderId: "desc" }],
      take: LATEST_ORDER_LIMIT,
    });

    return {
      ordersReceived: summary.ordersReceived,
      codOrders: summary.codOrders,
      codSharePercent: codShare(summary.ordersReceived, summary.codOrders),
      totalsByCurrency: [...summary.totals.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
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
        gateways: gatewayNames(row.gateways),
        isCod: row.isCod,
      })),
      refreshedAt: new Date().toISOString(),
    };
  });
}
