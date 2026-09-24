import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

import { ensureShopRegistered } from "../app/backend/modules/shops/shops-service.server";
import { action as ordersCreateAction } from "../app/frontend/routes/webhooks/webhooks-order-created";
import { action as uninstallAction } from "../app/frontend/routes/webhooks/webhooks-app-uninstalled";
import {
  actionArgs,
  applyWebhookTestEnv,
  FIXED_BODY,
  FIXED_HMAC,
  signedRequest,
  UNINSTALL_BODY,
  UNINSTALL_HMAC,
} from "./webhook-fixtures";

describe("webhook responses that make Shopify retry", () => {
  const prisma = new PrismaClient();
  const shop = "retry-shop.myshopify.com";

  function orderRequest() {
    return actionArgs(signedRequest(FIXED_BODY, FIXED_HMAC, { shop }));
  }

  async function withFailingTrigger(
    name: string,
    event: string,
    run: () => Promise<void>,
  ) {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name}`);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER ${name}
      ${event}
      BEGIN
        SELECT RAISE(ABORT, 'forced failure');
      END;
    `);
    try {
      await run();
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name}`);
    }
  }

  beforeEach(async () => {
    applyWebhookTestEnv();
    await prisma.webhookReceipt.deleteMany();
    await prisma.order.deleteMany();
    await prisma.shop.deleteMany();
    await prisma.session.deleteMany();
    await prisma.session.create({
      data: {
        id: "offline_retry-shop",
        shop,
        state: "state",
        isOnline: false,
        accessToken: "token",
      },
    });
  });

  afterAll(async () => {
    await prisma.webhookReceipt.deleteMany();
    await prisma.order.deleteMany();
    await prisma.shop.deleteMany();
    await prisma.session.deleteMany();
    await prisma.$disconnect();
  });

  it("answers 503 while shop setup is incomplete, then 200 once it finishes", async () => {
    const waiting = await ordersCreateAction(orderRequest());
    expect(waiting.status).toBe(503);
    expect(await prisma.webhookReceipt.count()).toBe(0);

    expect((await ensureShopRegistered(shop)).ok).toBe(true);
    const retry = await ordersCreateAction(orderRequest());
    expect(retry.status).toBe(200);
    expect(await prisma.order.count({ where: { shop } })).toBe(1);
  });

  it("answers 503 when the order write fails, then 200 on the retry", async () => {
    expect((await ensureShopRegistered(shop)).ok).toBe(true);

    await withFailingTrigger(
      "fail_order_insert",
      `BEFORE INSERT ON "Order"`,
      async () => {
        const failed = await ordersCreateAction(orderRequest());
        expect(failed.status).toBe(503);
        expect(await prisma.webhookReceipt.count()).toBe(0);
      },
    );

    const retry = await ordersCreateAction(orderRequest());
    expect(retry.status).toBe(200);
    expect(await prisma.order.count({ where: { shop } })).toBe(1);
  });

  it("logs a hashed shop token, never the shop domain", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await ensureShopRegistered(shop)).ok).toBe(true);
      await withFailingTrigger(
        "fail_order_insert",
        `BEFORE INSERT ON "Order"`,
        async () => {
          await ordersCreateAction(orderRequest());
        },
      );
      await ordersCreateAction(orderRequest());

      const lines = [...info.mock.calls, ...error.mock.calls].map((call) =>
        String(call[0]),
      );
      expect(lines).toHaveLength(2);
      for (const line of lines) {
        expect(line).not.toContain("retry-shop");
        expect(JSON.parse(line).shop).toMatch(/^shop_[0-9a-f]{12}$/);
      }
    } finally {
      info.mockRestore();
      error.mockRestore();
    }
  });

  it("answers 503 and keeps the shop when uninstall cleanup fails", async () => {
    expect((await ensureShopRegistered(shop)).ok).toBe(true);
    const uninstallRequest = () =>
      actionArgs(
        signedRequest(UNINSTALL_BODY, UNINSTALL_HMAC, {
          shop,
          topic: "APP_UNINSTALLED",
          webhookId: "uninstall-retry",
        }),
      );

    await withFailingTrigger(
      "fail_shop_delete",
      `BEFORE DELETE ON "Shop"`,
      async () => {
        const failed = await uninstallAction(uninstallRequest());
        expect(failed.status).toBe(503);
        expect(await prisma.shop.count({ where: { domain: shop } })).toBe(1);
        expect(await prisma.session.count({ where: { shop } })).toBe(1);
      },
    );

    const retry = await uninstallAction(uninstallRequest());
    expect(retry.status).toBe(200);
    expect(await prisma.shop.count({ where: { domain: shop } })).toBe(0);
  });

  it("keeps the shop when an uninstall is forged or has the wrong topic", async () => {
    expect((await ensureShopRegistered(shop)).ok).toBe(true);

    const forged = await uninstallAction(
      actionArgs(
        signedRequest(UNINSTALL_BODY, "not-a-real-signature", {
          shop,
          topic: "APP_UNINSTALLED",
        }),
      ),
    );
    expect(forged.status).toBe(401);

    const wrongTopic = await uninstallAction(
      actionArgs(
        signedRequest(UNINSTALL_BODY, UNINSTALL_HMAC, {
          shop,
          topic: "orders/create",
        }),
      ),
    );
    expect(wrongTopic.status).toBe(400);

    expect(await prisma.shop.count({ where: { domain: shop } })).toBe(1);
    expect(await prisma.session.count({ where: { shop } })).toBe(1);
  });
});
