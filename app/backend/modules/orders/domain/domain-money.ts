import { Decimal } from "decimal.js";

const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;
const CURRENCY_FRACTION_DIGITS = new Map<string, number>();

/** Thrown when a money string or currency cannot be stored safely as minor units. */
export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/** Prefer Intl.supportedValuesOf; fall back to constructing a currency formatter. */
function isSupportedCurrency(currency: string): boolean {
  if (!/^[A-Z]{3}$/.test(currency)) {
    return false;
  }
  if (typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("currency").includes(currency);
  }
  try {
    const resolved = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).resolvedOptions().currency;
    return resolved === currency;
  } catch {
    return false;
  }
}

/** ISO-4217 fraction digits for the currency (e.g. 2 for USD, 0 for JPY). */
function currencyFractionDigits(currency: string): number {
  const cached = CURRENCY_FRACTION_DIGITS.get(currency);
  if (cached !== undefined) {
    return cached;
  }
  if (!isSupportedCurrency(currency)) {
    throw new MoneyError(`Unsupported currency: ${currency}`);
  }
  try {
    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    });
    const options = formatter.resolvedOptions();
    const digits = options.maximumFractionDigits;
    if (typeof digits !== "number" || !Number.isInteger(digits) || digits < 0) {
      throw new MoneyError(`Unsupported currency: ${currency}`);
    }
    CURRENCY_FRACTION_DIGITS.set(currency, digits);
    return digits;
  } catch (error) {
    if (error instanceof MoneyError) {
      throw error;
    }
    throw new MoneyError(`Unsupported currency: ${currency}`);
  }
}

/**
 * Accept only non-negative plain decimal strings (no exponents).
 * Floating-point parse would lose cents; Decimal keeps exact scale.
 */
function parseAmount(amount: string): Decimal {
  if (typeof amount !== "string" || amount.trim() === "") {
    throw new MoneyError("Amount must be a non-empty decimal string");
  }
  if (/[eE]/.test(amount)) {
    throw new MoneyError("Exponent notation is not allowed");
  }
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    throw new MoneyError(`Invalid decimal amount: ${amount}`);
  }

  let decimal: Decimal;
  try {
    decimal = new Decimal(amount);
  } catch {
    throw new MoneyError(`Invalid decimal amount: ${amount}`);
  }

  if (!decimal.isFinite()) {
    throw new MoneyError("Amount must be finite");
  }
  if (decimal.isNegative()) {
    throw new MoneyError("Negative amounts are not allowed");
  }
  return decimal;
}

/** Scale must already be an integer; result must fit signed Prisma BigInt (int64). */
function minorFromScaled(scaled: Decimal): bigint {
  let minor: bigint;
  try {
    minor = BigInt(scaled.toFixed(0));
  } catch {
    throw new MoneyError("Amount cannot be represented as an integer");
  }
  if (minor < INT64_MIN || minor > INT64_MAX) {
    throw new MoneyError("Amount exceeds signed 64-bit storage range");
  }
  return minor;
}

/**
 * Store money as integer minor units (cents, yen, etc.) for DB aggregates.
 * Uses Decimal scale, never JS floating-point multiplication.
 */
export function toMinorUnits(amount: string, currency: string): bigint {
  const decimal = parseAmount(amount);
  const fractionDigits = currencyFractionDigits(currency);
  const scaled = decimal.mul(new Decimal(10).pow(fractionDigits));
  if (!scaled.isInteger()) {
    throw new MoneyError(
      `Amount has more than ${fractionDigits} fractional digits for ${currency}`,
    );
  }
  return minorFromScaled(scaled);
}

/**
 * Reconstruct an exact decimal string from minor units for loader/JSON.
 * Always pads to the currency's fraction digits so UI totals stay stable.
 */
export function fromMinorUnits(minor: bigint, currency: string): string {
  const fractionDigits = currencyFractionDigits(currency);
  const decimal = new Decimal(minor.toString()).div(
    new Decimal(10).pow(fractionDigits),
  );
  return decimal.toFixed(fractionDigits);
}
