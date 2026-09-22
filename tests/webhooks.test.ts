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

import { ingestOrderCreate } from "../app/models/orders.server";
import { getDashboardForShop } from "../app/models/orders.server";
import { purgeShopData } from "../app/models/shops.server";
import { ensureShopRegistered } from "../app/models/shops.server";
import { authenticateWebhookRequest } from "../app/webhooks.server";
import type { NormalizedOrder } from "../app/domain/order-payload.server";
import { action as ordersCreateAction } from "../app/routes/webhooks.orders.create";
import { action as uninstallAction } from "../app/routes/webhooks.app.uninstalled";

const TEST_SECRET = "cod-order-watch-test-secret-not-real";
const TEST_API_KEY = "cod-order-watch-test-api-key";
const TEST_APP_URL = "https://cod-order-watch.test";

/**
 * Fixed fixtures. Signatures were computed once with Node crypto, outside the
 * Shopify validator, and pasted here so this file does not sign the bytes it
 * then asks the validator to accept.
 */
const FIXED_BODY =
  '{"id":"1001","admin_graphql_api_id":"gid://shopify/Order/1001","name":"#1001","total_price":"12.34","currency":"USD","payment_gateway_names":["Cash on Delivery"],"financial_status":"pending","created_at":"2026-09-22T12:00:00Z"}';
const FIXED_HMAC = "qCes9mylIhtXkEwiXyvSPtD8Y8UGqVkyCRKOm8GWm2I=";
const MALFORMED_JSON_BODY = "{";
const MALFORMED_JSON_HMAC = "t1tE3NVjgIZCb+XuXOS6O0q8TkYTn6iB3kemkfkszJ4=";
const UNINSTALL_BODY = '{"ok":true}';
const UNINSTALL_HMAC = "UEM43rn6NrTn6x4B8qnhhxmpuBS4rcitUg21v3Sb4yM=";
const INVALID_ORDER_BODY = '{"id":"42","name":"#42"}';
const INVALID_ORDER_HMAC = "xxhAWK6cmow9i7GBs9AXdyq09tl5WgzRvyKupYwwJUc=";

function orderFixture(
  overrides: Partial<NormalizedOrder> = {},
): NormalizedOrder {
  return {
    orderId: "1001",
    name: "#1001",
    totalMinor: 1234n,
    currency: "USD",
    gateways: ["Cash on Delivery"],
    createdAt: new Date("2026-09-22T12:00:00Z"),
    isCod: true,
    ...overrides,
  };
}

function actionArgs(request: Request) {
  return {
    request,
    url: new URL(request.url),
    pattern: new URL(request.url).pathname,
    params: {},
    context: {},
  };
}

function signedRequest(
  body: string,
  hmac: string,
  extras: { shop?: string; topic?: string; webhookId?: string } = {},
): Request {
  return new Request("https://cod-order-watch.test/webhooks/orders/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Topic": extras.topic ?? "orders/create",
      "X-Shopify-Hmac-Sha256": hmac,
      "X-Shopify-Shop-Domain": extras.shop ?? "demo-shop.myshopify.com",
      "X-Shopify-API-Version": "2026-07",
      "X-Shopify-Webhook-Id": extras.webhookId ?? "delivery-1",
    },
    body,
  });
}

describe("webhook HMAC validation", () => {
  beforeEach(() => {
    process.env.SHOPIFY_API_KEY = TEST_API_KEY;
    process.env.SHOPIFY_API_SECRET = TEST_SECRET;
    process.env.SHOPIFY_APP_URL = TEST_APP_URL;
  });

  it("accepts the fixed payload and signature", async () => {
    const result = await authenticateWebhookRequest(
      signedRequest(FIXED_BODY, FIXED_HMAC),
      "ORDERS_CREATE",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.shop).toBe("demo-shop.myshopify.com");
      expect(result.data.webhookId).toBe("delivery-1");
      expect(result.data.topic).toBe("ORDERS_CREATE");
    }
  });

  it("rejects tampered body and bad signatures", async () => {
    const tampered = FIXED_BODY.replace("12.34", "12.35");
    const badBody = await authenticateWebhookRequest(
      signedRequest(tampered, FIXED_HMAC),
      "ORDERS_CREATE",
    );
    expect(badBody.ok).toBe(false);
    if (!badBody.ok) {
      expect(badBody.failure.status).toBe(401);
    }

    const shortSig = await authenticateWebhookRequest(
      signedRequest(FIXED_BODY, "abc"),
      "ORDERS_CREATE",
    );
    expect(shortSig.ok).toBe(false);

    const missing = await authenticateWebhookRequest(
      new Request("https://cod-order-watch.test/webhooks/orders/create", {
        method: "POST",
        body: FIXED_BODY,
      }),
      "ORDERS_CREATE",
    );
    expect(missing.ok).toBe(false);

    const whitespace = await authenticateWebhookRequest(
      signedRequest(`${FIXED_BODY} `, FIXED_HMAC),
      "ORDERS_CREATE",
    );
    expect(whitespace.ok).toBe(false);
    if (!whitespace.ok) {
      expect(whitespace.failure.status).toBe(401);
    }
  });

  it("rejects a body larger than the limit", async () => {
    const tooBig = "x".repeat(2 * 1024 * 1024 + 1);
    const result = await authenticateWebhookRequest(
      signedRequest(tooBig, FIXED_HMAC),
      "ORDERS_CREATE",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.status).toBe(413);
    }
  });

  it("rejects correctly signed malformed JSON", async () => {
    const result = await authenticateWebhookRequest(
      signedRequest(MALFORMED_JSON_BODY, MALFORMED_JSON_HMAC),
      "ORDERS_CREATE",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.status).toBe(400);
      expect(result.failure.reason).toBe("malformed_json");
    }
  });
});

describe("order ingest transactions", () => {
  const prisma = new PrismaClient();
  const shopA = "shop-a.myshopify.com";
  const shopB = "shop-b.myshopify.com";

  beforeEach(async () => {
    process.env.SHOPIFY_API_KEY = TEST_API_KEY;
    process.env.SHOPIFY_API_SECRET = TEST_SECRET;
    process.env.SHOPIFY_APP_URL = TEST_APP_URL;

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
