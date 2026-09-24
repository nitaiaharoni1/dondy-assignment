import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Session } from "@shopify/shopify-api";

import { ensureShopRegistered } from "../app/backend/modules/shops/shops-service.server";
import { registerShopFromSession } from "../app/backend/modules/shops/shops-service.server";
import { updateSessionScopes } from "../app/backend/modules/auth/auth-service.server";
import { headers as dashboardHeaders } from "../app/frontend/routes/app/app-dashboard";
import { loader as dashboardLoader } from "../app/frontend/routes/app/app-dashboard";
import { action as scopesUpdateAction } from "../app/frontend/routes/webhooks/webhooks-app-scopes-update";
import { actionArgs } from "./webhook-fixtures";

const adminSession = vi.hoisted(() => ({ shop: "" }));
const scopesWebhook = vi.hoisted(() => ({
  payload: {} as unknown,
  session: undefined as unknown,
}));

vi.mock("../app/backend/common/shopify/shopify-app.server", () => ({
  authenticate: {
    admin: vi.fn(async () => ({ session: adminSession })),
    webhook: vi.fn(async () => ({
      ...scopesWebhook,
      topic: "APP_SCOPES_UPDATE",
      shop: "scopes-shop.myshopify.com",
    })),
  },
}));

const prisma = new PrismaClient();
const shop = "scopes-shop.myshopify.com";
const sessionId = "offline_scopes-shop";

function dashboardRequest() {
  return actionArgs(new Request("https://cod-order-watch.test/app"));
}

beforeEach(async () => {
  await prisma.webhookReceipt.deleteMany();
  await prisma.order.deleteMany();
  await prisma.shop.deleteMany();
  await prisma.session.deleteMany();
  await prisma.session.create({
    data: {
      id: sessionId,
      shop,
      state: "state",
      isOnline: false,
      accessToken: "token",
      scope: "read_orders",
    },
  });
  adminSession.shop = shop;
});

afterAll(async () => {
  await prisma.session.deleteMany();
  await prisma.shop.deleteMany();
  await prisma.$disconnect();
});

describe("updateSessionScopes", () => {
  const session = new Session({
    id: sessionId,
    shop,
    state: "state",
    isOnline: false,
  });

  async function storedScope() {
    const row = await prisma.session.findUnique({ where: { id: sessionId } });
    return row?.scope;
  }

  it("stores the current scopes and drops non-string entries", async () => {
    await updateSessionScopes(session, {
      current: ["read_orders", 7, null, "write_orders"],
    });
    expect(await storedScope()).toBe("read_orders,write_orders");
  });

  it("stores an empty list when every scope was revoked", async () => {
    await updateSessionScopes(session, { current: [] });
    expect(await storedScope()).toBe("");
  });

  it("leaves the row alone without a session or a scope list", async () => {
    await updateSessionScopes(undefined, { current: ["write_orders"] });
    await updateSessionScopes(session, null);
    await updateSessionScopes(session, { current: "write_orders" });
    await updateSessionScopes(session, { previous: ["read_orders"] });
    expect(await storedScope()).toBe("read_orders");
  });

  it("saves new scopes through the webhook route", async () => {
    scopesWebhook.session = session;
    scopesWebhook.payload = { current: ["read_orders", "write_orders"] };
    const response = await scopesUpdateAction(
      actionArgs(
        new Request("https://cod-order-watch.test/webhooks/app/scopes_update", {
          method: "POST",
        }),
      ),
    );
    expect(response.status).toBe(200);
    expect(await storedScope()).toBe("read_orders,write_orders");
  });
});

describe("registerShopFromSession", () => {
  it("registers the shop for an offline session only", async () => {
    await registerShopFromSession(
      new Session({ id: "online_1", shop, state: "state", isOnline: true }),
    );
    expect(await prisma.shop.count()).toBe(0);

    await registerShopFromSession(
      new Session({ id: sessionId, shop, state: "state", isOnline: false }),
    );
    expect(await prisma.shop.count({ where: { domain: shop } })).toBe(1);
  });
});

describe("dashboard loader", () => {
  it("registers the shop and returns metrics", async () => {
    const payload = await dashboardLoader(dashboardRequest());
    expect(payload.ok).toBe(true);
    if (payload.ok) {
      expect(payload.data.ordersReceived).toBe(0);
    }
    expect(await prisma.shop.count({ where: { domain: shop } })).toBe(1);
  });

  it("asks for a reopen when no offline session exists", async () => {
    await prisma.session.deleteMany();
    const payload = await dashboardLoader(dashboardRequest());
    expect(payload).toEqual({
      ok: false,
      error: expect.stringMatching(/installation record is not ready/),
    });
  });

  it("returns a retry message instead of throwing when metrics fail", async () => {
    expect((await ensureShopRegistered(shop)).ok).toBe(true);
    await prisma.order.create({
      data: {
        shop,
        orderId: "bad-currency",
        name: "#1",
        totalMinor: 100n,
        currency: "ZZZ",
        gateways: [],
        createdAt: new Date("2026-09-22T12:00:00Z"),
        isCod: false,
      },
    });

    const payload = await dashboardLoader(dashboardRequest());
    expect(payload).toEqual({
      ok: false,
      error: expect.stringMatching(/Could not load order metrics/),
    });
  });

  it("shows only text gateway names from stored rows", async () => {
    expect((await ensureShopRegistered(shop)).ok).toBe(true);
    await prisma.order.create({
      data: {
        shop,
        orderId: "odd-gateways",
        name: "#2",
        totalMinor: 500n,
        currency: "USD",
        gateways: ["Cash on Delivery", 5, null],
        createdAt: new Date("2026-09-22T12:00:00Z"),
        isCod: true,
      },
    });

    const payload = await dashboardLoader(dashboardRequest());
    expect(payload.ok).toBe(true);
    if (payload.ok) {
      expect(payload.data.latestOrders[0]?.gateways).toEqual([
        "Cash on Delivery",
      ]);
      expect(payload.data.latestOrders[0]?.total).toBe("5.00");
    }
  });

  it("marks the response as not cacheable", () => {
    const result = dashboardHeaders({
      loaderHeaders: new Headers({ "X-Test": "1" }),
      parentHeaders: new Headers(),
      actionHeaders: new Headers(),
      errorHeaders: undefined,
    });
    const headers = new Headers(result);
    expect(headers.get("Cache-Control")).toBe("private, no-store");
    expect(headers.get("X-Test")).toBe("1");
  });
});
