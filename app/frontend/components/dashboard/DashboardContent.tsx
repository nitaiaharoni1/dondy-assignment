import type { DashboardData } from "../../../shared/types/dashboard";
import { formatDateTime } from "../../utils/date/date-format";
import { MetricsSummary } from "./metrics/MetricsSummary";
import { DashboardOrdersTable } from "./DashboardOrdersTable";

export function DashboardContent({ data }: { data: DashboardData }) {
  return (
    <>
      <s-section heading="Snapshot">
        <s-paragraph>
          Counts cover every order this installation accepted from{" "}
          <s-text type="strong">orders/create</s-text> deliveries. Existing
          store orders are not imported automatically. Dates use your browser
          locale and timezone.
        </s-paragraph>
        <s-paragraph>
          Last refreshed: {formatDateTime(data.refreshedAt)}
        </s-paragraph>
      </s-section>
      {data.ordersReceived === 0 ? (
        <s-section heading="No orders yet">
          <s-paragraph>
            After installation, new Cash-on-Delivery and other orders appear
            here when Shopify delivers{" "}
            <s-text type="strong">orders/create</s-text>. Create a test order in
            the development store, then refresh.
          </s-paragraph>
        </s-section>
      ) : null}
      <MetricsSummary data={data} />
      <s-section heading="Latest orders">
        <DashboardOrdersTable orders={data.latestOrders} />
      </s-section>
    </>
  );
}
