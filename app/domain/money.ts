import { Decimal } from "decimal.js";

const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

function currencyFractionDigits(currency: string): number {
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
    return digits;
  } catch {
    throw new MoneyError(`Unsupported currency: ${currency}`);
  }
}

/**
 * Convert a Shopify decimal money string into signed 64-bit minor units.
 * Never uses floating-point multiplication.
 */
export function toMinorUnits(amount: string, currency: string): bigint {
  if (typeof amount !== "string" || amount.trim() === "") {
    throw new MoneyError("Amount must be a non-empty decimal string");
  }
  if (/[eE]/.test(amount)) {
    throw new MoneyError("Exponent notation is not allowed");
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

  const fractionDigits = currencyFractionDigits(currency);
  const scaled = decimal.mul(new Decimal(10).pow(fractionDigits));

  if (!scaled.isInteger()) {
    throw new MoneyError(
      `Amount has more than ${fractionDigits} fractional digits for ${currency}`,
    );
  }

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

/** Reconstruct an exact decimal string from minor units (for loader/JSON). */
export function fromMinorUnits(minor: bigint, currency: string): string {
  const fractionDigits = currencyFractionDigits(currency);
  const decimal = new Decimal(minor.toString()).div(
    new Decimal(10).pow(fractionDigits),
  );
  return decimal.toFixed(fractionDigits);
}
