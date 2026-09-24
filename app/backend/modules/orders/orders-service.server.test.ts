import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hasOfflineSession } from "../shops/shops-repository.server";
import { shopExists } from "../shops/shops-repository.server";
import type { NormalizedOrder } from "./domain/domain-payload.server";
import { createOrderIfAbsent } from "./orders-repository.server";
import { createWebhookReceipt } from "./orders-repository.server";
import { findLatestOrders } from "./orders-repository.server";
import { groupOrdersByCurrencyAndCod } from "./orders-repository.server";
import { webhookReceiptExists } from "./orders-repository.server";
import { getDashboardForShop } from "./orders-service.server";
import { ingestOrderCreate } from "./orders-service.server";

vi.mock("../../common/db/db-client.server", () => ({
  withTransaction: vi.fn((fn: (tx: object) => Promise<unknown>) => fn({})),
}));

vi.mock("../shops/shops-repository.server", () => ({
  hasOfflineSession: vi.fn(),
  shopExists: vi.fn(),
}));

vi.mock("./orders-repository.server", () => ({
  createOrderIfAbsent: vi.fn(),
  createWebhookReceipt: vi.fn(),
  findLatestOrders: vi.fn(),
  groupOrdersByCurrencyAndCod: vi.fn(),
  webhookReceiptExists: vi.fn(),
}));

const SHOP = "demo-shop.myshopify.com";

const ORDER: NormalizedOrder = {
  orderId: "1001",
  name: "#1001",
  totalMinor: 1000n,
  currency: "USD",
  gateways: ["Cash on Delivery"],
  createdAt: new Date("2026-09-22T10:00:00Z"),
  isCod: true,
};

function ingest() {
  return ingestOrderCreate({
    shop: " Demo-Shop.myshopify.com ",
    webhookId: "w1",
    topic: "ORDERS_CREATE",
    order: ORDER,
  });
}

function group(
  currency: string,
  isCod: boolean,
  count: number,
  sum: bigint | null,
) {
  return {
    currency,
    isCod,
    _count: { _all: count },
    _sum: { totalMinor: sum },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(shopExists).mockResolvedValue(true);
  vi.mocked(hasOfflineSession).mockResolvedValue(false);
  vi.mocked(webhookReceiptExists).mockResolvedValue(false);
  vi.mocked(groupOrdersByCurrencyAndCod).mockResolvedValue([]);
  vi.mocked(findLatestOrders).mockResolvedValue([]);
});

describe("ingestOrderCreate", () => {
  it("writes the receipt and the order under the normalized shop", async () => {
    await expect(ingest()).resolves.toEqual({ status: "accepted" });
    expect(createWebhookReceipt).toHaveBeenCalledWith(
      {},
      { shop: SHOP, webhookId: "w1", topic: "ORDERS_CREATE" },
    );
    expect(createOrderIfAbsent).toHaveBeenCalledWith({}, SHOP, ORDER);
  });

  it("returns unknown_shop when there is no shop and no session", async () => {
    vi.mocked(shopExists).mockResolvedValue(false);

    await expect(ingest()).resolves.toEqual({ status: "unknown_shop" });
    expect(createWebhookReceipt).not.toHaveBeenCalled();
  });

  it("returns setup_incomplete when only the offline session exists", async () => {
    vi.mocked(shopExists).mockResolvedValue(false);
    vi.mocked(hasOfflineSession).mockResolvedValue(true);

    await expect(ingest()).resolves.toEqual({ status: "setup_incomplete" });
    expect(createOrderIfAbsent).not.toHaveBeenCalled();
  });

  it("treats a failed write as a duplicate when the receipt already exists", async () => {
    vi.mocked(createWebhookReceipt).mockRejectedValue(new Error("P2002"));
    vi.mocked(webhookReceiptExists).mockResolvedValue(true);

    await expect(ingest()).resolves.toEqual({ status: "duplicate" });
    expect(webhookReceiptExists).toHaveBeenCalledWith(SHOP, "w1");
  });

  it("rethrows a failed write when no receipt exists", async () => {
    const failure = new Error("database is locked");
    vi.mocked(createOrderIfAbsent).mockRejectedValue(failure);

    await expect(ingest()).rejects.toBe(failure);
  });
});

describe("getDashboardForShop", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects a blank shop", async () => {
    await expect(getDashboardForShop("   ")).rejects.toThrow(
      "shop is required",
    );
  });

  it("returns zeros for a shop with no orders", async () => {
    const dashboard = await getDashboardForShop(SHOP);
    expect(dashboard.ordersReceived).toBe(0);
    expect(dashboard.codOrders).toBe(0);
    expect(dashboard.codSharePercent).toBe(0);
    expect(dashboard.totalsByCurrency).toEqual([]);
    expect(dashboard.latestOrders).toEqual([]);
  });

  it("merges COD and non-COD groups per currency and sorts currencies", async () => {
    vi.mocked(groupOrdersByCurrencyAndCod).mockResolvedValue([
      group("USD", true, 1, 1000n),
      group("USD", false, 2, 250n),
      group("EUR", false, 3, null),
    ]);

    const dashboard = await getDashboardForShop(SHOP);

    expect(dashboard.ordersReceived).toBe(6);
    expect(dashboard.codOrders).toBe(1);
    expect(dashboard.codSharePercent).toBe(16.7);
    expect(dashboard.totalsByCurrency).toEqual([
      { currency: "EUR", amount: "0.00" },
      { currency: "USD", amount: "12.50" },
    ]);
  });

  it.each([
    [1, 3, 33.3],
    [2, 3, 66.7],
    [1, 8, 12.5],
    [3, 3, 100],
  ])("rounds %i of %i COD orders to %s percent", async (cod, total, share) => {
    vi.mocked(groupOrdersByCurrencyAndCod).mockResolvedValue([
      group("USD", true, cod, 0n),
      group("USD", false, total - cod, 0n),
    ]);

    const dashboard = await getDashboardForShop(SHOP);
    expect(dashboard.codSharePercent).toBe(share);
  });

  it("maps latest orders for the UI and keeps only string gateways", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T08:00:00Z"));
    vi.mocked(findLatestOrders).mockResolvedValue([
      {
        orderId: "7",
        name: "#7",
        createdAt: new Date("2026-09-22T10:00:00Z"),
        totalMinor: 2925n,
        currency: "ILS",
        gateways: ["Cash on Delivery", 5, null],
        isCod: true,
      },
      {
        orderId: "8",
        name: "#8",
        createdAt: new Date("2026-09-22T11:00:00Z"),
        totalMinor: 500n,
        currency: "JPY",
        gateways: "manual",
        isCod: false,
      },
    ]);

    const dashboard = await getDashboardForShop(SHOP);

    expect(findLatestOrders).toHaveBeenCalledWith({}, SHOP, 20);
    expect(dashboard.refreshedAt).toBe("2026-09-24T08:00:00.000Z");
    expect(dashboard.latestOrders).toEqual([
      {
        id: "7",
        name: "#7",
        createdAt: "2026-09-22T10:00:00.000Z",
        total: "29.25",
        currency: "ILS",
        gateways: ["Cash on Delivery"],
        isCod: true,
      },
      {
        id: "8",
        name: "#8",
        createdAt: "2026-09-22T11:00:00.000Z",
        total: "500",
        currency: "JPY",
        gateways: [],
        isCod: false,
      },
    ]);
  });
});
