import type { DashboardCurrencyTotal } from "../../../../shared/types/dashboard";

export function MetricsTotals({ rows }: { rows: DashboardCurrencyTotal[] }) {
  if (rows.length === 0) {
    return <s-paragraph>No received order value yet.</s-paragraph>;
  }

  return (
    <s-stack direction="block" gap="base">
      {rows.map((row) => (
        <s-paragraph key={row.currency}>
          {row.currency} {row.amount}
        </s-paragraph>
      ))}
    </s-stack>
  );
}
