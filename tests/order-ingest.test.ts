import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { getDashboardForShop } from "../app/orders/dashboard.server";
import { ingestOrderCreate } from "../app/orders/ingest.server";
import { ensureShopRegistered } from "../app/orders/shops.server";
import { purgeShopData } from "../app/orders/shops.server";
import { applyWebhookTestEnv } from "./webhook-fixtures";
import { orderFixture } from "./webhook-fixtures";

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

  it("accepts once and treats the same delivery as a duplicate", async () => {
    const first = await ingestOrderCreate({
      shop: shopA,
      webhookId: "wh-1",
      topic: "ORDERS_CREATE",
      order: orderFixture(),
    });
    expect(first.status).toBe("accepted");

    const second = await ingestOrderCreate({
      shop: shopA,
      webhookId: "wh-1",
      topic: "ORDERS_CREATE",
      order: orderFixture(),
    });
    expect(second.status).toBe("duplicate");

    const orders = await prisma.order.count({ where: { shop: shopA } });
    const receipts = await prisma.webhookReceipt.count({
      where: { shop: shopA },
    });
    expect(orders).toBe(1);
    expect(receipts).toBe(1);

    const dash = await getDashboardForShop(shopA);
    expect(dash.ordersReceived).toBe(1);
  });

  it("accepts and deduplicates quickly on this machine", async () => {
    const started = Date.now();
    const first = await ingestOrderCreate({
      shop: shopA,
      webhookId: "wh-timing",
      topic: "ORDERS_CREATE",
      order: orderFixture({ orderId: "timing-1" }),
    });
    const acceptedMs = Date.now() - started;
    expect(first.status).toBe("accepted");

    const retryStarted = Date.now();
    const second = await ingestOrderCreate({
      shop: shopA,
      webhookId: "wh-timing",
      topic: "ORDERS_CREATE",
      order: orderFixture({ orderId: "timing-1" }),
    });
    const duplicateMs = Date.now() - retryStarted;
    expect(second.status).toBe("duplicate");
    expect(acceptedMs).toBeLessThan(500);
    expect(duplicateMs).toBeLessThan(500);
  });

  it("keeps one order when a second delivery id arrives", async () => {
    await ingestOrderCreate({
      shop: shopA,
      webhookId: "wh-1",
      topic: "ORDERS_CREATE",
      order: orderFixture(),
    });
    await ingestOrderCreate({
      shop: shopA,
      webhookId: "wh-2",
      topic: "ORDERS_CREATE",
      order: orderFixture(),
    });

    expect(await prisma.order.count({ where: { shop: shopA } })).toBe(1);
    expect(await prisma.webhookReceipt.count({ where: { shop: shopA } })).toBe(
      2,
    );
  });

  it("keeps the first snapshot when a later message disagrees", async () => {
    await ingestOrderCreate({
      shop: shopA,
      webhookId: "wh-first",
      topic: "ORDERS_CREATE",
      order: orderFixture({ totalMinor: 100n, isCod: false, gateways: [] }),
    });
    const sameDelivery = await ingestOrderCreate({
      shop: shopA,
      webhookId: "wh-first",
      topic: "ORDERS_CREATE",
      order: orderFixture({
        orderId: "9999",
        totalMinor: 9999n,
        isCod: true,
      }),
    });
    const laterDelivery = await ingestOrderCreate({
      shop: shopA,
      webhookId: "wh-later",
      topic: "ORDERS_CREATE",
      order: orderFixture({ totalMinor: 9999n, isCod: true }),
    });
    expect(sameDelivery.status).toBe("duplicate");
    expect(laterDelivery.status).toBe("accepted");
    const row = await prisma.order.findUnique({
      where: { shop_orderId: { shop: shopA, orderId: "1001" } },
    });
    expect(row?.totalMinor).toBe(100n);
    expect(row?.isCod).toBe(false);
    expect(await prisma.order.count({ where: { shop: shopA } })).toBe(1);
  });

  it("isolates shop dashboards and cleans up on uninstall", async () => {
    await ingestOrderCreate({
      shop: shopA,
      webhookId: "wh-a",
      topic: "ORDERS_CREATE",
      order: orderFixture({ orderId: "shared" }),
    });
    await ingestOrderCreate({
      shop: shopB,
      webhookId: "wh-a",
      topic: "ORDERS_CREATE",
      order: orderFixture({ orderId: "shared", name: "#B" }),
    });

    const dashA = await getDashboardForShop(shopA);
    const dashB = await getDashboardForShop(shopB);
    expect(dashA.ordersReceived).toBe(1);
    expect(dashB.ordersReceived).toBe(1);
    expect(dashA.latestOrders[0]?.name).toBe("#1001");
    expect(dashB.latestOrders[0]?.name).toBe("#B");

    await purgeShopData(shopA);
    expect(await prisma.order.count({ where: { shop: shopA } })).toBe(0);
    expect(await prisma.session.count({ where: { shop: shopA } })).toBe(0);
    expect(await prisma.shop.count({ where: { domain: shopA } })).toBe(0);
    expect(await prisma.order.count({ where: { shop: shopB } })).toBe(1);

    await purgeShopData(shopA);
    expect(await prisma.shop.count({ where: { domain: shopA } })).toBe(0);
  });

  it("stores a mixed-case shop once and keeps the install time", async () => {
    const mixed = "Mixed-Shop.myshopify.com";
    await prisma.session.create({
      data: {
        id: "offline_mixed",
        shop: mixed,
        state: "state",
        isOnline: false,
        accessToken: "token-mixed",
      },
    });
    expect((await ensureShopRegistered(mixed)).ok).toBe(true);
    await prisma.shop.update({
      where: { domain: "mixed-shop.myshopify.com" },
      data: { installedAt: new Date("2020-01-01T00:00:00.000Z") },
    });
    expect((await ensureShopRegistered("MIXED-SHOP.myshopify.com")).ok).toBe(
      true,
    );
    const row = await prisma.shop.findUnique({
      where: { domain: "mixed-shop.myshopify.com" },
    });
    expect(row?.installedAt.toISOString()).toBe("2020-01-01T00:00:00.000Z");

    const saved = await ingestOrderCreate({
      shop: "MIXED-SHOP.myshopify.com",
      webhookId: "wh-mixed",
      topic: "ORDERS_CREATE",
      order: orderFixture({ orderId: "mixed-1", name: "#M" }),
    });
    expect(saved.status).toBe("accepted");
    const dash = await getDashboardForShop("mixed-shop.myshopify.com");
    expect(dash.ordersReceived).toBe(1);
    expect(dash.latestOrders[0]?.name).toBe("#M");

    await purgeShopData("MIXED-SHOP.myshopify.com");
    expect(await prisma.session.count({ where: { id: "offline_mixed" } })).toBe(
      0,
    );
    expect(
      await prisma.shop.count({
        where: { domain: "mixed-shop.myshopify.com" },
      }),
    ).toBe(0);
  });

  it("returns setup_incomplete when offline session exists without Shop", async () => {
    await prisma.shop.delete({ where: { domain: shopA } });
    const result = await ingestOrderCreate({
      shop: shopA,
      webhookId: "wh-setup",
      topic: "ORDERS_CREATE",
      order: orderFixture({ orderId: "setup-1" }),
    });
    expect(result.status).toBe("setup_incomplete");
    expect(await prisma.order.count({ where: { shop: shopA } })).toBe(0);
  });

  it("ignores unknown shops without creating data", async () => {
    const result = await ingestOrderCreate({
      shop: "ghost.myshopify.com",
      webhookId: "wh-ghost",
      topic: "ORDERS_CREATE",
      order: orderFixture({ orderId: "ghost-1" }),
    });
    expect(result.status).toBe("unknown_shop");
    expect(
      await prisma.shop.count({ where: { domain: "ghost.myshopify.com" } }),
    ).toBe(0);
  });
});
