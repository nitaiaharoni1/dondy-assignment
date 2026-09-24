import { afterEach, describe, expect, it, vi } from "vitest";

import { logWebhook } from "./webhooks-log.server";
import { shopLogToken } from "./webhooks-log.server";

describe("shopLogToken", () => {
  it("returns a short stable token that hides the domain", () => {
    const token = shopLogToken("demo-shop.myshopify.com");
    expect(token).toMatch(/^shop_[0-9a-f]{12}$/);
    expect(token).not.toContain("demo-shop");
    expect(shopLogToken("demo-shop.myshopify.com")).toBe(token);
  });

  it("gives different shops different tokens", () => {
    expect(shopLogToken("a.myshopify.com")).not.toBe(
      shopLogToken("b.myshopify.com"),
    );
  });
});

describe("logWebhook", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("writes one JSON line to info with the elapsed time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logWebhook("info", 900, { outcome: "accepted", webhookId: "w1" });

    expect(info).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(info.mock.calls[0]?.[0]))).toEqual({
      outcome: "accepted",
      webhookId: "w1",
      durationMs: 100,
    });
  });

  it("sends error level to console.error only", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    logWebhook("error", Date.now(), { outcome: "persist_failed" });

    expect(error).toHaveBeenCalledTimes(1);
    expect(info).not.toHaveBeenCalled();
  });
});
