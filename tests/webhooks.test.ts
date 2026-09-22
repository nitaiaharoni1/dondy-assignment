import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { ingestOrderCreate } from "../app/models/orders.server";
import { getDashboardForShop } from "../app/models/orders.server";
import { purgeShopData } from "../app/models/shops.server";
import { ensureShopRegistered } from "../app/models/shops.server";
import { authenticateWebhookRequest } from "../app/webhooks.server";
import type { NormalizedOrder } from "../app/domain/order-payload.server";

const TEST_SECRET = "cod-order-watch-test-secret-not-real";
const TEST_API_KEY = "cod-order-watch-test-api-key";
const TEST_APP_URL = "https://cod-order-watch.test";

/**
 * Independently computed fixture (openssl / Node createHmac), not taken from
 * the validator under test at assertion time.
 */
const FIXED_BODY =
  '{"id":"1001","admin_graphql_api_id":"gid://shopify/Order/1001","name":"#1001","total_price":"12.34","currency":"USD","payment_gateway_names":["Cash on Delivery"],"financial_status":"pending","created_at":"2026-09-22T12:00:00Z"}';
const FIXED_HMAC = createHmac("sha256", TEST_SECRET)
  .update(FIXED_BODY, "utf8")
  .digest("base64");

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
