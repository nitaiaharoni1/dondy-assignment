/**
 * Assignment COD heuristic (classification, not cash confirmation):
 * - any gateway containing "cash" after trim + lowercase, OR
 * - financial_status is "pending" and a gateway is exactly "manual"
 */
export function isCodOrder(
  gateways: readonly string[],
  financialStatus: string | null,
): boolean {
  const normalized = gateways.map((gateway) => gateway.trim().toLowerCase());

  if (normalized.some((gateway) => gateway.includes("cash"))) {
    return true;
  }

  const pending = financialStatus?.trim().toLowerCase() === "pending";
  if (pending && normalized.some((gateway) => gateway === "manual")) {
    return true;
  }

  return false;
}
