import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { getDashboardForShop } from "../app/backend/modules/orders/orders-service.server";
import { ingestOrderCreate } from "../app/backend/modules/orders/orders-service.server";
import { ensureShopRegistered } from "../app/backend/modules/shops/shops-service.server";
import { purgeShopData } from "../app/backend/modules/shops/shops-service.server";
import { action as ordersCreateAction } from "../app/frontend/routes/webhooks/webhooks-order-created";
import {
  actionArgs,
  applyWebhookTestEnv,
  FIXED_BODY,
  FIXED_HMAC,
  orderFixture,
  signedRequest,
} from "./webhook-fixtures";

describe("order arrival edges", () => {
  const prisma = new PrismaClient();
  const shop = "late.myshopify.com";
  const shopB = "neighbor.myshopify.com";

  async function createOfflineSession(
    id: string,
    domain = shop,
    accessToken = "token",
  ): Promise<void> {
    await prisma.session.create({
      data: { id, shop: domain, state: "state", isOnline: false, accessToken },
    });
  }

  beforeEach(async () => {
    applyWebhookTestEnv();
    await prisma.webhookReceipt.deleteMany();
    await prisma.order.deleteMany();
    await prisma.shop.deleteMany();
    await prisma.session.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("accepts the same delivery after the shop appears", async () => {
    const first = await ingestOrderCreate({
      shop,
      webhookId: "wh-late",
      topic: "ORDERS_CREATE",
      order: orderFixture({ orderId: "late-1" }),
    });
    expect(first.status).toBe("unknown_shop");

    await createOfflineSession("offline_late");
    expect((await ensureShopRegistered(shop)).ok).toBe(true);

    const retry = await ingestOrderCreate({
      shop,
      webhookId: "wh-late",
      topic: "ORDERS_CREATE",
      order: orderFixture({ orderId: "late-1" }),
    });
    expect(retry.status).toBe("accepted");
    expect(await prisma.order.count({ where: { shop } })).toBe(1);
  });

  it("accepts the same delivery after setup finishes", async () => {
    await createOfflineSession("offline_setup");
    const waiting = await ingestOrderCreate({
      shop,
      webhookId: "wh-setup-late",
      topic: "ORDERS_CREATE",
      order: orderFixture({ orderId: "setup-late" }),
    });
    expect(waiting.status).toBe("setup_incomplete");

    expect((await ensureShopRegistered(shop)).ok).toBe(true);
    const retry = await ingestOrderCreate({
      shop,
      webhookId: "wh-setup-late",
      topic: "ORDERS_CREATE",
      order: orderFixture({ orderId: "setup-late" }),
    });
    expect(retry.status).toBe("accepted");
  });

  it("ignores an online-only session and a missing uninstall", async () => {
    await prisma.session.create({
      data: {
        id: "online_only",
        shop,
        state: "state",
        isOnline: true,
        accessToken: "token",
      },
    });
    expect((await ensureShopRegistered(shop)).ok).toBe(false);
    await expect(
      purgeShopData("nobody.myshopify.com"),
    ).resolves.toBeUndefined();
    expect(await prisma.shop.count()).toBe(0);
  });

  it("stores a hostile order name as plain text", async () => {
    await createOfflineSession("offline_html");
    await ensureShopRegistered(shop);
    const name = "<script>alert(1)</script>";
    const saved = await ingestOrderCreate({
      shop,
      webhookId: "wh-html",
      topic: "ORDERS_CREATE",
      order: orderFixture({ orderId: "html-1", name }),
    });
    expect(saved.status).toBe("accepted");
    const row = await prisma.order.findUnique({
      where: { shop_orderId: { shop, orderId: "html-1" } },
    });
    expect(row?.name).toBe(name);
  });

  it("stores Hebrew and emoji order names unchanged", async () => {
    await createOfflineSession("offline_unicode");
    await ensureShopRegistered(shop);
    const name = "הזמנה #42 🚚";
    const saved = await ingestOrderCreate({
      shop,
      webhookId: "wh-unicode",
      topic: "ORDERS_CREATE",
      order: orderFixture({ orderId: "unicode-1", name }),
    });
    expect(saved.status).toBe("accepted");
    const row = await prisma.order.findUnique({
      where: { shop_orderId: { shop, orderId: "unicode-1" } },
    });
    expect(row?.name).toBe(name);
  });

  it("purges one shop then accepts the same webhook id after reinstall", async () => {
    await createOfflineSession("offline_late");
    await createOfflineSession("offline_neighbor", shopB, "token-b");
    await ensureShopRegistered(shop);
    await ensureShopRegistered(shopB);

    await ingestOrderCreate({
      shop,
      webhookId: "wh-shared",
      topic: "ORDERS_CREATE",
      order: orderFixture({ orderId: "shared-1" }),
    });
    await ingestOrderCreate({
      shop: shopB,
      webhookId: "wh-shared",
      topic: "ORDERS_CREATE",
      order: orderFixture({ orderId: "shared-1", name: "#B" }),
    });

    await purgeShopData(shop);
    expect(await prisma.order.count({ where: { shop } })).toBe(0);
    expect(await prisma.webhookReceipt.count({ where: { shop } })).toBe(0);
    expect(await prisma.order.count({ where: { shop: shopB } })).toBe(1);
    expect(await prisma.webhookReceipt.count({ where: { shop: shopB } })).toBe(
      1,
    );
    expect(await prisma.session.count({ where: { shop: shopB } })).toBe(1);

    await createOfflineSession("offline_late_again", shop, "token-2");
    expect((await ensureShopRegistered(shop)).ok).toBe(true);
    const reinstalled = await prisma.shop.findUnique({
      where: { domain: shop },
    });
    expect(reinstalled).not.toBeNull();

    const again = await ingestOrderCreate({
      shop,
      webhookId: "wh-shared",
      topic: "ORDERS_CREATE",
      order: orderFixture({ orderId: "shared-1", name: "#again" }),
    });
    expect(again.status).toBe("accepted");
    expect(await prisma.order.count({ where: { shop } })).toBe(1);
    expect(await prisma.order.count({ where: { shop: shopB } })).toBe(1);
  });

  it("rounds one COD of three orders to a tenth of a percent", async () => {
    await createOfflineSession("offline_pct");
    await ensureShopRegistered(shop);
    for (const [i, isCod] of [true, false, false].entries()) {
      await ingestOrderCreate({
        shop,
        webhookId: `wh-pct-${i}`,
        topic: "ORDERS_CREATE",
        order: orderFixture({
          orderId: String(2000 + i),
          isCod,
          currency: i === 0 ? "USD" : "EUR",
          totalMinor: 100n,
        }),
      });
    }
    const dash = await getDashboardForShop(shop);
    expect(dash.ordersReceived).toBe(3);
    expect(dash.codOrders).toBe(1);
    expect(dash.codSharePercent).toBe(33.3);
    expect(dash.totalsByCurrency).toEqual([
      { currency: "EUR", amount: "2.00" },
      { currency: "USD", amount: "1.00" },
    ]);
  });

  it("rounds the COD share half up and breaks time ties by order id", async () => {
    await createOfflineSession("offline_ties");
    await ensureShopRegistered(shop);
    const sameTime = new Date("2026-09-22T12:00:00Z");
    for (let i = 0; i < 16; i += 1) {
      await ingestOrderCreate({
        shop,
        webhookId: `wh-tie-${i}`,
        topic: "ORDERS_CREATE",
        order: orderFixture({
          orderId: String(3000 + i),
          isCod: i === 0,
          createdAt: sameTime,
        }),
      });
    }
    const dash = await getDashboardForShop(shop);
    expect(dash.codSharePercent).toBe(6.3);
    expect(dash.latestOrders.map((order) => order.id).slice(0, 3)).toEqual([
      "3015",
      "3014",
      "3013",
    ]);
  });

  it("refuses a blank shop and a non-myshopify domain", async () => {
    await expect(getDashboardForShop("   ")).rejects.toThrow(
      /shop is required/,
    );

    await createOfflineSession("offline_custom", "store.example.com");
    expect((await ensureShopRegistered("store.example.com")).ok).toBe(false);
    expect(await prisma.shop.count()).toBe(0);
  });

  it("answers 200 for a signed order from an unknown shop", async () => {
    const response = await ordersCreateAction(
      actionArgs(
        signedRequest(FIXED_BODY, FIXED_HMAC, {
          shop: "ghost.myshopify.com",
          webhookId: "ghost-delivery",
        }),
      ),
    );
    expect(response.status).toBe(200);
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.webhookReceipt.count()).toBe(0);
  });
});
