/**
 * Assignment COD heuristic: classification only, not proof cash was collected.
 * Substring "cash" after trim + lowercase is intentional (e.g. "cashier" matches).
 * The other path requires pending financial_status and a gateway exactly "manual".
 */
export function isCodOrder(
  gateways: readonly string[],
  financialStatus: string | null,
): boolean {
  const normalized = gateways.map((gateway) => gateway.trim().toLowerCase());

  // Substring match: "Cash on Delivery", "cashier", etc.
  if (normalized.some((gateway) => gateway.includes("cash"))) {
    return true;
  }

  // Exact "manual" only; "manual payment" does not qualify.
  const pending = financialStatus?.trim().toLowerCase() === "pending";
  if (pending && normalized.some((gateway) => gateway === "manual")) {
    return true;
  }

  return false;
}
