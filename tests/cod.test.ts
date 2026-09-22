import { describe, expect, it } from "vitest";

import { isCodOrder } from "../app/orders/cod";
import { fromMinorUnits } from "../app/orders/money";
import { toMinorUnits } from "../app/orders/money";
import { normalizeOrderPayload } from "../app/orders/payload.server";
import { OrderPayloadError } from "../app/orders/payload.server";

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
});

describe("money", () => {
  it("converts USD, JPY, and KWD exactly", () => {
    expect(toMinorUnits("0.10", "USD")).toBe(10n);
    expect(toMinorUnits("0.20", "USD")).toBe(20n);
    expect(fromMinorUnits(30n, "USD")).toBe("0.30");
    expect(toMinorUnits("100.00", "JPY")).toBe(100n);
    expect(fromMinorUnits(100n, "JPY")).toBe("100");
    expect(toMinorUnits("1.234", "KWD")).toBe(1234n);
    expect(fromMinorUnits(1234n, "KWD")).toBe("1.234");
  });

  it("rejects invalid financial data", () => {
    expect(() => toMinorUnits("abc", "USD")).toThrow(/Invalid decimal|Amount/);
    expect(() => toMinorUnits("-1.00", "USD")).toThrow(/Negative/);
    expect(() => toMinorUnits("1.00", "ZZZ")).toThrow(/Unsupported currency/);
    expect(() => toMinorUnits("1.234", "USD")).toThrow(/fractional digits/);
    expect(() => toMinorUnits("1e2", "USD")).toThrow(/Exponent/);
  });
});

describe("normalizeOrderPayload", () => {
  it("prefers GraphQL id and rejects unsafe numeric ids", () => {
    const normalized = normalizeOrderPayload({
      admin_graphql_api_id: "gid://shopify/Order/9007199254740993",
      name: "#1001",
      total_price: "10.00",
      currency: "usd",
      payment_gateway_names: ["Cash on Delivery"],
      financial_status: "pending",
      created_at: "2026-09-22T10:00:00Z",
    });
    expect(normalized.orderId).toBe("9007199254740993");
    expect(normalized.isCod).toBe(true);
    expect(normalized.currency).toBe("USD");

    expect(() =>
      normalizeOrderPayload({
        id: Number.MAX_SAFE_INTEGER + 1,
        name: "#1002",
        total_price: "1.00",
        currency: "USD",
        payment_gateway_names: [],
        financial_status: "paid",
        created_at: "2026-09-22T10:00:00Z",
      }),
    ).toThrow(OrderPayloadError);
  });

  it("drops blank gateway names and trims the order name", () => {
    const normalized = normalizeOrderPayload({
      id: "10",
      name: "  #10  ",
      total_price: "1.00",
      currency: "USD",
      payment_gateway_names: ["  ", " Cash on Delivery "],
      financial_status: "paid",
      created_at: "2026-09-22T10:00:00Z",
    });
    expect(normalized.name).toBe("#10");
    expect(normalized.gateways).toEqual(["Cash on Delivery"]);
    expect(normalized.isCod).toBe(true);
  });

  it("treats only blank gateways as an empty non-COD list", () => {
    const normalized = normalizeOrderPayload({
      id: "11",
      name: "#11",
      total_price: "1.00",
      currency: "USD",
      payment_gateway_names: ["   "],
      financial_status: "pending",
      created_at: "2026-09-22T10:00:00Z",
    });
    expect(normalized.gateways).toEqual([]);
    expect(normalized.isCod).toBe(false);
  });

  it("rejects an order name that is only spaces", () => {
    expect(() =>
      normalizeOrderPayload({
        id: "12",
        name: "   ",
        total_price: "1.00",
        currency: "USD",
        payment_gateway_names: [],
        financial_status: "paid",
        created_at: "2026-09-22T10:00:00Z",
      }),
    ).toThrow(OrderPayloadError);
  });

  it("rejects disagreeing ids", () => {
    expect(() =>
      normalizeOrderPayload({
        id: "1",
        admin_graphql_api_id: "gid://shopify/Order/2",
        name: "#1003",
        total_price: "1.00",
        currency: "USD",
        payment_gateway_names: ["manual"],
        financial_status: "pending",
        created_at: "2026-09-22T10:00:00Z",
      }),
    ).toThrow(OrderPayloadError);
  });
});
