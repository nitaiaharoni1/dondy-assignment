import { describe, expect, it } from "vitest";

import { normalizeOrderPayload } from "./domain-payload.server";
import { OrderPayloadError } from "./domain-payload.server";

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

  it("keeps zero-total cash COD and rejects bad money fields", () => {
    const zeroCash = normalizeOrderPayload({
      id: "70",
      name: "#70",
      total_price: "0.00",
      currency: "USD",
      payment_gateway_names: ["Cash on Delivery"],
      financial_status: "pending",
      created_at: "2026-09-22T10:00:00Z",
    });
    expect(zeroCash.totalMinor).toBe(0n);
    expect(zeroCash.isCod).toBe(true);

    expect(() =>
      normalizeOrderPayload({
        id: "71",
        name: "#71",
        total_price: null,
        currency: "USD",
        payment_gateway_names: [],
        created_at: "2026-09-22T10:00:00Z",
      }),
    ).toThrow(OrderPayloadError);
    expect(() =>
      normalizeOrderPayload({
        id: "72",
        name: "#72",
        total_price: "",
        currency: "USD",
        payment_gateway_names: [],
        created_at: "2026-09-22T10:00:00Z",
      }),
    ).toThrow(OrderPayloadError);
    expect(() =>
      normalizeOrderPayload({
        id: "73",
        name: "#73",
        total_price: "0.001",
        currency: "USD",
        payment_gateway_names: [],
        created_at: "2026-09-22T10:00:00Z",
      }),
    ).toThrow(OrderPayloadError);
  });

  it("requires a gateway list and treats empty as non-COD", () => {
    expect(
      normalizeOrderPayload({
        id: "80",
        name: "#80",
        total_price: "1.00",
        currency: "USD",
        payment_gateway_names: [],
        financial_status: "pending",
        created_at: "2026-09-22T10:00:00Z",
      }).isCod,
    ).toBe(false);

    expect(() =>
      normalizeOrderPayload({
        id: "81",
        name: "#81",
        total_price: "1.00",
        currency: "USD",
        financial_status: "pending",
        created_at: "2026-09-22T10:00:00Z",
      }),
    ).toThrow(OrderPayloadError);
    expect(() =>
      normalizeOrderPayload({
        id: "82",
        name: "#82",
        total_price: "1.00",
        currency: "USD",
        payment_gateway_names: null,
        financial_status: "pending",
        created_at: "2026-09-22T10:00:00Z",
      }),
    ).toThrow(OrderPayloadError);
  });
});
