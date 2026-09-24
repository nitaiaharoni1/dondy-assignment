import type { TxClient } from "../../common/db/db-client.server";
import { withTransaction } from "../../common/db/db-client.server";
import type { DashboardData } from "../../../shared/types/dashboard";
import type { DashboardPayload } from "../../../shared/types/dashboard";
import { hasOfflineSession } from "../shops/shops-repository.server";
import { shopExists } from "../shops/shops-repository.server";
import { ensureShopRegistered } from "../shops/shops-service.server";
import { normalizeShopDomain } from "../shops/shops-service.server";
import { fromMinorUnits } from "./domain/domain-money";
import type { NormalizedOrder } from "./domain/domain-payload.server";
import { normalizeOrderPayload } from "./domain/domain-payload.server";
import { createOrderIfAbsent } from "./orders-repository.server";
import { createWebhookReceipt } from "./orders-repository.server";
import { findLatestOrders } from "./orders-repository.server";
import { groupOrdersByCurrencyAndCod } from "./orders-repository.server";
import { webhookReceiptExists } from "./orders-repository.server";

type IngestResult =
  | { status: "accepted" }
  | { status: "duplicate" }
  | { status: "unknown_shop" }
  | { status: "setup_incomplete" };

const TX_MAX_WAIT_MS = 500;
const TX_TIMEOUT_MS = 1000;
const LATEST_ORDER_LIMIT = 20;

/**
 * Shop row missing: offline Session still present means install is mid-flight
 * (setup_incomplete). No Session means we never registered this shop (unknown_shop).
 */
async function missingShop(tx: TxClient, shop: string): Promise<IngestResult> {
  if (await hasOfflineSession(tx, shop)) {
    return { status: "setup_incomplete" };
  }
  return { status: "unknown_shop" };
}

/**
 * Persist an orders/create delivery. Receipt and order commit in one
 * transaction. After a write failure, an existing receipt means a duplicate:
 * covers unique races (P2002) and SQLite busy/timeouts once the winner committed.
 */
export async function ingestOrderCreate(input: {
  shop: string;
  webhookId: string;
  topic: string;
  order: NormalizedOrder;
}): Promise<IngestResult> {
  const shop = normalizeShopDomain(input.shop);
  try {
    return await withTransaction(
      async (tx) => {
        if (!(await shopExists(tx, shop))) {
          return missingShop(tx, shop);
        }
        await createWebhookReceipt(tx, {
          shop,
          webhookId: input.webhookId,
          topic: input.topic,
        });
        await createOrderIfAbsent(tx, shop, input.order);
        return { status: "accepted" };
      },
      { maxWait: TX_MAX_WAIT_MS, timeout: TX_TIMEOUT_MS },
    );
  } catch (error) {
    if (await webhookReceiptExists(shop, input.webhookId)) {
      return { status: "duplicate" };
    }
    throw error;
  }
}

/** Raw orders/create delivery. Throws OrderPayloadError for invalid payloads. */
export async function ingestOrderWebhook(delivery: {
  shop: string;
  webhookId: string;
  topic: string;
  payload: unknown;
}): Promise<IngestResult> {
  const { payload, ...rest } = delivery;
  return ingestOrderCreate({ ...rest, order: normalizeOrderPayload(payload) });
}

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

type OrderGroup = Awaited<
  ReturnType<typeof groupOrdersByCurrencyAndCod>
>[number];

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
  return withTransaction(async (tx) => {
    const summary = foldGroups(await groupOrdersByCurrencyAndCod(tx, domain));
    const latest = await findLatestOrders(tx, domain, LATEST_ORDER_LIMIT);

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

/**
 * Embedded app home: ensure Shop is registered, then load metrics.
 * A not-yet-registered shop is a soft error payload.
 */
export async function loadDashboard(shop: string): Promise<DashboardPayload> {
  const registration = await ensureShopRegistered(shop);
  if (!registration.ok) {
    return {
      ok: false,
      error:
        "This store is authenticated but the installation record is not ready yet. Open the app again in a moment.",
    };
  }

  return { ok: true, data: await getDashboardForShop(shop) };
}
