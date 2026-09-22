import { describe, expect, it } from "vitest";

import { toMinorUnits } from "../app/orders/money";
import { normalizeOrderPayload } from "../app/orders/payload.server";
import { OrderPayloadError } from "../app/orders/payload.server";

describe("payload money and gateway edges", () => {
  it("rejects null-like totals and unknown currencies", () => {
    expect(() => toMinorUnits("", "USD")).toThrow(/non-empty|Amount/);
    expect(() => toMinorUnits("0.001", "USD")).toThrow(/fractional digits/);
    expect(() => toMinorUnits("1.00", "XXX")).toThrow(/Unsupported currency/);
    expect(() => toMinorUnits("1.00", "")).toThrow(/Unsupported currency/);
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
