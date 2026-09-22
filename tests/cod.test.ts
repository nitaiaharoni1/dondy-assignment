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

  it("treats nearby words by the written rule", () => {
    expect(isCodOrder(["cashier"], "paid")).toBe(true);
    expect(isCodOrder(["manual payment"], "pending")).toBe(false);
    expect(isCodOrder([" MANUAL "], "PENDING")).toBe(true);
    expect(isCodOrder(["manual"], null)).toBe(false);
    expect(isCodOrder(["cod"], "pending")).toBe(false);
    expect(isCodOrder(["cod"], "paid")).toBe(false);
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
    expect(() => toMinorUnits("-1.00", "USD")).toThrow(
      /Invalid decimal|Negative/,
    );
    expect(() => toMinorUnits("1.00", "ZZZ")).toThrow(/Unsupported currency/);
    expect(() => toMinorUnits("1.234", "USD")).toThrow(/fractional digits/);
    expect(() => toMinorUnits("1e2", "USD")).toThrow(/Exponent/);
    expect(() => toMinorUnits("+1.00", "USD")).toThrow(/Invalid decimal/);
    expect(() => toMinorUnits(" 1.00", "USD")).toThrow(/Invalid decimal/);
    expect(() => toMinorUnits("99999999999999999999.99", "USD")).toThrow(
      /64-bit/,
    );
  });

  it("converts shekels and rejects a yen fraction", () => {
    expect(toMinorUnits("29.25", "ILS")).toBe(2925n);
    expect(fromMinorUnits(2925n, "ILS")).toBe("29.25");
    expect(toMinorUnits("1.2", "USD")).toBe(120n);
    expect(() => toMinorUnits("100.5", "JPY")).toThrow(/fractional digits/);
  });

  it("accepts zero and a whole number of dollars", () => {
    expect(toMinorUnits("0.00", "USD")).toBe(0n);
    expect(toMinorUnits("0", "JPY")).toBe(0n);
    expect(toMinorUnits("10", "USD")).toBe(1000n);
    expect(toMinorUnits("00.10", "USD")).toBe(10n);
    expect(fromMinorUnits(0n, "USD")).toBe("0.00");
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

  it("keeps a huge string id and rejects the unsafe edges", () => {
    const huge = "9007199254740993";
    const normalized = normalizeOrderPayload({
      id: huge,
      name: "#edge",
      total_price: "1.00",
      currency: "ils",
      payment_gateway_names: ["manual"],
      financial_status: "partially_paid",
      created_at: "2026-09-22T10:00:00+03:00",
    });
    expect(normalized.orderId).toBe(huge);
    expect(normalized.currency).toBe("ILS");
    expect(normalized.isCod).toBe(false);

    expect(() =>
      normalizeOrderPayload({
        id: Number.MAX_SAFE_INTEGER,
        name: "#ok",
        total_price: "1",
        currency: "USD",
        payment_gateway_names: [],
        created_at: "2026-09-22T10:00:00Z",
      }),
    ).not.toThrow();

    expect(() =>
      normalizeOrderPayload({
        id: "0",
        name: "#z",
        total_price: "1.00",
        currency: "USD",
        payment_gateway_names: [],
        created_at: "2026-09-22T10:00:00Z",
      }),
    ).toThrow(OrderPayloadError);
    expect(() =>
      normalizeOrderPayload({
        id: 1.5,
        name: "#f",
        total_price: "1.00",
        currency: "USD",
        payment_gateway_names: [],
        created_at: "2026-09-22T10:00:00Z",
      }),
    ).toThrow(OrderPayloadError);
  });

  it("rejects oversized names, gateway lists, and a bad clock", () => {
    const base = {
      id: "50",
      total_price: "1.00",
      currency: "USD",
      payment_gateway_names: ["card"],
      created_at: "2026-09-22T10:00:00Z",
    };
    expect(() =>
      normalizeOrderPayload({ ...base, name: "x".repeat(129) }),
    ).toThrow(OrderPayloadError);
    expect(() =>
      normalizeOrderPayload({
        ...base,
        name: "#ok",
        payment_gateway_names: Array.from({ length: 33 }, () => "card"),
      }),
    ).toThrow(OrderPayloadError);
    expect(() =>
      normalizeOrderPayload({
        ...base,
        name: "#ok",
        payment_gateway_names: ["y".repeat(129)],
      }),
    ).toThrow(OrderPayloadError);
    expect(() =>
      normalizeOrderPayload({ ...base, name: "#ok", created_at: "yesterday" }),
    ).toThrow(OrderPayloadError);
    expect(() =>
      normalizeOrderPayload({
        ...base,
        name: "#ok",
        total_price: 10 as unknown as string,
      }),
    ).toThrow(OrderPayloadError);
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
