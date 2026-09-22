import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PrismaClient } from "@prisma/client";

import { getDashboardForShop } from "../app/orders/dashboard.server";
import { ingestOrderCreate } from "../app/orders/ingest.server";
import { ensureShopRegistered } from "../app/orders/shops.server";
import { purgeShopData } from "../app/orders/shops.server";
import { action as ordersCreateAction } from "../app/routes/webhooks.orders.create";
import { action as uninstallAction } from "../app/routes/webhooks.app.uninstalled";
import {
  actionArgs,
  applyWebhookTestEnv,
  FIXED_BODY,
  INVALID_ORDER_BODY,
  INVALID_ORDER_HMAC,
  orderFixture,
  signedRequest,
  UNINSTALL_BODY,
  UNINSTALL_HMAC,
} from "./webhook-fixtures";

describe("order ingest transactions", () => {
  const prisma = new PrismaClient();
  const shopA = "shop-a.myshopify.com";
  const shopB = "shop-b.myshopify.com";

  beforeEach(async () => {
    applyWebhookTestEnv();

    await prisma.webhookReceipt.deleteMany();
    await prisma.order.deleteMany();
    await prisma.shop.deleteMany();
    await prisma.session.deleteMany();

    await prisma.session.create({
      data: {
        id: "offline_shop-a",
        shop: shopA,
        state: "state",
        isOnline: false,
        accessToken: "token-a",
      },
    });
    await prisma.session.create({
      data: {
        id: "offline_shop-b",
        shop: shopB,
        state: "state",
        isOnline: false,
        accessToken: "token-b",
      },
    });
    await ensureShopRegistered(shopA);
    await ensureShopRegistered(shopB);
  });

  afterEach(async () => {
    await prisma.webhookReceipt.deleteMany();
    await prisma.order.deleteMany();
    await prisma.shop.deleteMany();
    await prisma.session.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rolls back the receipt when the order write fails, then accepts a retry", async () => {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS fail_order_insert`);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER fail_order_insert
      BEFORE INSERT ON "Order"
      BEGIN
        SELECT RAISE(ABORT, 'forced order failure');
      END;
    `);

    try {
      await expect(
        ingestOrderCreate({
          shop: shopA,
          webhookId: "wh-rollback",
          topic: "ORDERS_CREATE",
          order: orderFixture({ orderId: "rollback-1" }),
        }),
      ).rejects.toThrow();
      expect(await prisma.order.count({ where: { shop: shopA } })).toBe(0);
      expect(
        await prisma.webhookReceipt.count({ where: { shop: shopA } }),
      ).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS fail_order_insert`,
      );
    }

    const retry = await ingestOrderCreate({
      shop: shopA,
      webhookId: "wh-rollback",
      topic: "ORDERS_CREATE",
      order: orderFixture({ orderId: "rollback-1" }),
    });
    expect(retry.status).toBe("accepted");
    expect(await prisma.order.count({ where: { shop: shopA } })).toBe(1);
    expect(await prisma.webhookReceipt.count({ where: { shop: shopA } })).toBe(
      1,
    );
  });

  it("keeps one order when the same delivery arrives twice at once", async () => {
    const input = {
      shop: shopA,
      webhookId: "wh-race",
      topic: "ORDERS_CREATE",
      order: orderFixture({ orderId: "race-1" }),
    };
    const results = await Promise.allSettled([
      ingestOrderCreate(input),
      ingestOrderCreate(input),
    ]);

    const fulfilled = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value.status] : [],
    );
    expect(
      fulfilled.filter((status) => status === "accepted").length,
    ).toBeLessThanOrEqual(1);

    if (results.some((result) => result.status === "rejected")) {
      const retry = await ingestOrderCreate(input);
      expect(retry.status === "accepted" || retry.status === "duplicate").toBe(
        true,
      );
    }

    expect(await prisma.order.count({ where: { shop: shopA } })).toBe(1);
    expect(await prisma.webhookReceipt.count({ where: { shop: shopA } })).toBe(
      1,
    );
  });

  it("shows an empty dashboard without inventing a currency", async () => {
    const dash = await getDashboardForShop(shopA);
    expect(dash.ordersReceived).toBe(0);
    expect(dash.codOrders).toBe(0);
    expect(dash.codSharePercent).toBe(0);
    expect(dash.totalsByCurrency).toEqual([]);
    expect(dash.latestOrders).toEqual([]);
  });

  it("keeps metrics for every order and shows only the latest 20", async () => {
    for (let i = 0; i < 25; i += 1) {
      const even = i % 2 === 0;
      const saved = await ingestOrderCreate({
        shop: shopA,
        webhookId: `wh-page-${i}`,
        topic: "ORDERS_CREATE",
        order: orderFixture({
          orderId: String(1000 + i),
          name: `#${1000 + i}`,
          currency: even ? "USD" : "JPY",
          totalMinor: even ? 100n : 50n,
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
          isCod: i % 3 === 0,
        }),
      });
      expect(saved.status).toBe("accepted");
    }

    const dash = await getDashboardForShop(shopA);
    expect(dash.ordersReceived).toBe(25);
    expect(dash.codOrders).toBe(9);
    expect(dash.codSharePercent).toBe(36);
    expect(dash.latestOrders).toHaveLength(20);
    expect(dash.latestOrders[0]?.id).toBe("1024");
    expect(dash.latestOrders[19]?.id).toBe("1005");
    expect(dash.totalsByCurrency).toEqual([
      { currency: "JPY", amount: "600" },
      { currency: "USD", amount: "13.00" },
    ]);
  });

  it("returns 400 for a signed payload that is not an order", async () => {
    const response = await ordersCreateAction(
      actionArgs(signedRequest(INVALID_ORDER_BODY, INVALID_ORDER_HMAC)),
    );
    expect(response.status).toBe(400);
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.webhookReceipt.count()).toBe(0);
  });

  it("does not recreate a shop from an order after uninstall", async () => {
    await purgeShopData(shopA);
    const result = await ingestOrderCreate({
      shop: shopA,
      webhookId: "wh-late",
      topic: "ORDERS_CREATE",
      order: orderFixture({ orderId: "late-1" }),
    });
    expect(result.status).toBe("unknown_shop");
    expect(await prisma.shop.count({ where: { domain: shopA } })).toBe(0);
    expect(await prisma.order.count({ where: { shop: shopA } })).toBe(0);
  });

  it("rolls back uninstall when shop deletion fails", async () => {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS fail_shop_delete`);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER fail_shop_delete
      BEFORE DELETE ON "Shop"
      BEGIN
        SELECT RAISE(ABORT, 'forced shop delete failure');
      END;
    `);

    try {
      await expect(purgeShopData(shopA)).rejects.toThrow();
      expect(await prisma.session.count({ where: { shop: shopA } })).toBe(1);
      expect(await prisma.shop.count({ where: { domain: shopA } })).toBe(1);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS fail_shop_delete`);
    }

    await purgeShopData(shopA);
    expect(await prisma.session.count({ where: { shop: shopA } })).toBe(0);
    expect(await prisma.shop.count({ where: { domain: shopA } })).toBe(0);
    expect(await prisma.shop.count({ where: { domain: shopB } })).toBe(1);
  });

  it("does not write when the signature is forged", async () => {
    const response = await ordersCreateAction(
      actionArgs(signedRequest(FIXED_BODY, "not-a-real-signature")),
    );
    expect(response.status).toBe(401);
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.webhookReceipt.count()).toBe(0);
  });

  it("purges one shop on uninstall without a network call, then accepts a repeat", async () => {
    await ingestOrderCreate({
      shop: shopA,
      webhookId: "wh-uninstall-a",
      topic: "ORDERS_CREATE",
      order: orderFixture({ orderId: "uninstall-a" }),
    });
    await ingestOrderCreate({
      shop: shopB,
      webhookId: "wh-uninstall-b",
      topic: "ORDERS_CREATE",
      order: orderFixture({ orderId: "uninstall-b", name: "#B" }),
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const first = await uninstallAction(
      actionArgs(
        signedRequest(UNINSTALL_BODY, UNINSTALL_HMAC, {
          shop: shopA,
          topic: "APP_UNINSTALLED",
          webhookId: "uninstall-1",
        }),
      ),
    );
    expect(first.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    expect(await prisma.order.count({ where: { shop: shopA } })).toBe(0);
    expect(await prisma.webhookReceipt.count({ where: { shop: shopA } })).toBe(
      0,
    );
    expect(await prisma.session.count({ where: { shop: shopA } })).toBe(0);
    expect(await prisma.shop.count({ where: { domain: shopA } })).toBe(0);
    expect(await prisma.order.count({ where: { shop: shopB } })).toBe(1);

    const second = await uninstallAction(
      actionArgs(
        signedRequest(UNINSTALL_BODY, UNINSTALL_HMAC, {
          shop: shopA,
          topic: "APP_UNINSTALLED",
          webhookId: "uninstall-2",
        }),
      ),
    );
    expect(second.status).toBe(200);
    expect(await prisma.order.count({ where: { shop: shopB } })).toBe(1);
  });
});
