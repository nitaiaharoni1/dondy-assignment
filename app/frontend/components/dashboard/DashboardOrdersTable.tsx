import type { DashboardOrder } from "../../../shared/types/dashboard";
import { formatDateTime } from "../../utils/date/date-format";

export function DashboardOrdersTable({ orders }: { orders: DashboardOrder[] }) {
  if (orders.length === 0) {
    return <s-paragraph>No orders to list yet.</s-paragraph>;
  }

  return (
    <s-table>
      <s-table-header-row>
        <s-table-header listSlot="primary">Order</s-table-header>
        <s-table-header>Date</s-table-header>
        <s-table-header>Total</s-table-header>
        <s-table-header>Gateways</s-table-header>
        <s-table-header>COD</s-table-header>
      </s-table-header-row>
      <s-table-body>
        {orders.map((order) => (
          <s-table-row key={order.id}>
            <s-table-cell>{order.name}</s-table-cell>
            <s-table-cell>{formatDateTime(order.createdAt)}</s-table-cell>
            <s-table-cell>
              {order.currency} {order.total}
            </s-table-cell>
            <s-table-cell>
              <span
                style={{
                  display: "inline-block",
                  maxWidth: "16rem",
                  overflowWrap: "anywhere",
                }}
              >
                {order.gateways.length > 0
                  ? order.gateways.join(", ")
                  : "Not specified"}
              </span>
            </s-table-cell>
            <s-table-cell>{order.isCod ? "Yes" : "No"}</s-table-cell>
          </s-table-row>
        ))}
      </s-table-body>
    </s-table>
  );
}
