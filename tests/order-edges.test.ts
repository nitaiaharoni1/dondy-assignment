import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { ingestOrderCreate } from "../app/orders/ingest.server";
import { ensureShopRegistered } from "../app/orders/shops.server";
import { purgeShopData } from "../app/orders/shops.server";
import { orderFixture } from "./webhook-fixtures";

describe("order arrival edges", () => {
  const prisma = new PrismaClient();
  const shop = "late.myshopify.com";

  beforeEach(async () => {
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

    await prisma.session.create({
      data: {
        id: "offline_late",
        shop,
        state: "state",
        isOnline: false,
        accessToken: "token",
      },
    });
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
    await prisma.session.create({
      data: {
        id: "offline_setup",
        shop,
        state: "state",
        isOnline: false,
        accessToken: "token",
      },
    });
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
    await prisma.session.create({
      data: {
        id: "offline_html",
        shop,
        state: "state",
        isOnline: false,
        accessToken: "token",
      },
    });
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
});
