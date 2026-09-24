import type { Session } from "@shopify/shopify-api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createShopIfAbsent } from "./shops-repository.server";
import { deleteSessionsForShop } from "./shops-repository.server";
import { deleteShop } from "./shops-repository.server";
import { hasOfflineSession } from "./shops-repository.server";
import { hasRegisteredOfflineShop } from "./shops-repository.server";
import { shopExists } from "./shops-repository.server";
import { ensureShopRegistered } from "./shops-service.server";
import { normalizeShopDomain } from "./shops-service.server";
import { purgeShopData } from "./shops-service.server";
import { registerShopFromSession } from "./shops-service.server";

vi.mock("../../common/db/db-client.server", () => ({
  withTransaction: vi.fn((fn: (tx: object) => Promise<unknown>) => fn({})),
}));

vi.mock("./shops-repository.server", () => ({
  createShopIfAbsent: vi.fn(),
  deleteSessionsForShop: vi.fn(),
  deleteShop: vi.fn(),
  hasOfflineSession: vi.fn(),
  hasRegisteredOfflineShop: vi.fn(),
  shopExists: vi.fn(),
}));

const SHOP = "demo-shop.myshopify.com";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasRegisteredOfflineShop).mockResolvedValue(false);
  vi.mocked(hasOfflineSession).mockResolvedValue(true);
  vi.mocked(shopExists).mockResolvedValue(false);
});

describe("normalizeShopDomain", () => {
  it("trims and lower-cases the domain", () => {
    expect(normalizeShopDomain("  Demo-Shop.MyShopify.com ")).toBe(SHOP);
  });
});

describe("ensureShopRegistered", () => {
  it("rejects a domain outside myshopify.com without touching the database", async () => {
    await expect(ensureShopRegistered("evil.example.com")).resolves.toEqual({
      ok: false,
      reason: "missing_offline_session",
    });
    expect(hasRegisteredOfflineShop).not.toHaveBeenCalled();
    expect(createShopIfAbsent).not.toHaveBeenCalled();
  });

  it("returns early when the shop is already registered", async () => {
    vi.mocked(hasRegisteredOfflineShop).mockResolvedValue(true);

    await expect(ensureShopRegistered(SHOP)).resolves.toEqual({ ok: true });
    expect(hasOfflineSession).not.toHaveBeenCalled();
    expect(createShopIfAbsent).not.toHaveBeenCalled();
  });

  it("refuses to register without an offline session", async () => {
    vi.mocked(hasOfflineSession).mockResolvedValue(false);

    await expect(ensureShopRegistered(SHOP)).resolves.toEqual({
      ok: false,
      reason: "missing_offline_session",
    });
    expect(createShopIfAbsent).not.toHaveBeenCalled();
  });

  it("creates the shop row with the normalized domain", async () => {
    await expect(
      ensureShopRegistered(" DEMO-SHOP.myshopify.com"),
    ).resolves.toEqual({ ok: true });
    expect(createShopIfAbsent).toHaveBeenCalledWith({}, SHOP);
  });

  it("does not rewrite an existing shop row", async () => {
    vi.mocked(shopExists).mockResolvedValue(true);

    await expect(ensureShopRegistered(SHOP)).resolves.toEqual({ ok: true });
    expect(createShopIfAbsent).not.toHaveBeenCalled();
  });
});

describe("registerShopFromSession", () => {
  it("ignores online sessions", async () => {
    await registerShopFromSession({ isOnline: true, shop: SHOP } as Session);
    expect(hasRegisteredOfflineShop).not.toHaveBeenCalled();
  });

  it("registers from an offline session", async () => {
    await registerShopFromSession({ isOnline: false, shop: SHOP } as Session);
    expect(createShopIfAbsent).toHaveBeenCalledWith({}, SHOP);
  });
});

describe("purgeShopData", () => {
  it("deletes sessions and the shop for the normalized domain", async () => {
    await purgeShopData("Demo-Shop.myshopify.com");
    expect(deleteSessionsForShop).toHaveBeenCalledWith({}, SHOP);
    expect(deleteShop).toHaveBeenCalledWith({}, SHOP);
  });
});
