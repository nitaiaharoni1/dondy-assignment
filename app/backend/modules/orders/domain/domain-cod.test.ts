import { describe, expect, it } from "vitest";

import { isCodOrder } from "./domain-cod";

describe("isCodOrder", () => {
  it("matches cash substring with mixed case and whitespace", () => {
    expect(isCodOrder(["  Cash on Delivery "], "paid")).toBe(true);
    expect(isCodOrder(["card", "CASH"], "paid")).toBe(true);
  });

  it("matches pending plus exact manual only", () => {
    expect(isCodOrder(["manual"], "pending")).toBe(true);
    expect(isCodOrder(["manual"], "paid")).toBe(false);
    expect(isCodOrder(["shopify_payments"], "pending")).toBe(false);
  });

  it("treats empty gateways as non-COD and cash without pending", () => {
    expect(isCodOrder([], "pending")).toBe(false);
    expect(isCodOrder(["cash_on_delivery"], "paid")).toBe(true);
  });

  it("treats nearby words by the written rule", () => {
    expect(isCodOrder(["cashier"], "paid")).toBe(true);
    expect(isCodOrder(["manual payment"], "pending")).toBe(false);
    expect(isCodOrder([" MANUAL "], "PENDING")).toBe(true);
    expect(isCodOrder(["manual"], null)).toBe(false);
    expect(isCodOrder(["cod"], "pending")).toBe(false);
    expect(isCodOrder(["cod"], "paid")).toBe(false);
  });
});
