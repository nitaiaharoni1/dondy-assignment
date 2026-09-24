import { describe, expect, it } from "vitest";

import { fromMinorUnits } from "./domain-money";
import { toMinorUnits } from "./domain-money";

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

  it("rejects null-like totals and unknown currencies", () => {
    expect(() => toMinorUnits("", "USD")).toThrow(/non-empty|Amount/);
    expect(() => toMinorUnits("0.001", "USD")).toThrow(/fractional digits/);
    expect(() => toMinorUnits("1.00", "XXX")).toThrow(/Unsupported currency/);
    expect(() => toMinorUnits("1.00", "")).toThrow(/Unsupported currency/);
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
