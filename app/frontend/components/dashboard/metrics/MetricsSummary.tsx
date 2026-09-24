import type { DashboardData } from "../../../../shared/types/dashboard";
import { MetricsCard } from "./MetricsCard";
import { MetricsTotals } from "./MetricsTotals";

export function MetricsSummary({ data }: { data: DashboardData }) {
  return (
    <>
      <MetricsCard
        heading="Orders received"
        value={String(data.ordersReceived)}
      />
      <MetricsCard heading="COD orders" value={String(data.codOrders)} />
      <MetricsCard
        heading="COD share"
        value={`${data.codSharePercent.toFixed(1)}%`}
      />
      <s-section heading="Total order value">
        <MetricsTotals rows={data.totalsByCurrency} />
      </s-section>
    </>
  );
}
