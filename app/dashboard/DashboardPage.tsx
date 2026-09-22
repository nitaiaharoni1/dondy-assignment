import { useNavigation } from "react-router";
import { useRevalidator } from "react-router";

import type { DashboardData } from "../orders/dashboard.server";
import { formatDateTime } from "./format-date";

type LoaderSuccess = {
  ok: true;
  data: DashboardData;
};

type LoaderFailure = {
  ok: false;
  error: string;
};

export type DashboardPayload = LoaderSuccess | LoaderFailure;

function RefreshButton({ refreshing }: { refreshing: boolean }) {
  const revalidator = useRevalidator();
  return (
    <s-button
      slot="primary-action"
      onClick={() => {
        revalidator.revalidate();
      }}
      {...(refreshing ? { loading: true, disabled: true } : {})}
    >
      Refresh
    </s-button>
  );
}

function Metric({ heading, value }: { heading: string; value: string }) {
  return (
    <s-section heading={heading}>
      <s-heading>{value}</s-heading>
    </s-section>
  );
}

function Totals({ rows }: { rows: DashboardData["totalsByCurrency"] }) {
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

function OrdersTable({ orders }: { orders: DashboardData["latestOrders"] }) {
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

function Populated({ data }: { data: DashboardData }) {
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
      <Metric heading="Orders received" value={String(data.ordersReceived)} />
      <Metric heading="COD orders" value={String(data.codOrders)} />
      <Metric
        heading="COD share"
        value={`${data.codSharePercent.toFixed(1)}%`}
      />
      <s-section heading="Total order value">
        <Totals rows={data.totalsByCurrency} />
      </s-section>
      <s-section heading="Latest orders">
        <OrdersTable orders={data.latestOrders} />
      </s-section>
    </>
  );
}

export function DashboardPage({ payload }: { payload: DashboardPayload }) {
  const revalidator = useRevalidator();
  const navigation = useNavigation();
  const refreshing =
    revalidator.state === "loading" || navigation.state === "loading";

  if (!payload.ok) {
    return (
      <s-page heading="COD Order Watch">
        <s-section heading="Could not load metrics">
          <s-paragraph>{payload.error}</s-paragraph>
          <s-button
            onClick={() => {
              revalidator.revalidate();
            }}
            {...(refreshing ? { loading: true } : {})}
          >
            Refresh
          </s-button>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="COD Order Watch">
      <RefreshButton refreshing={refreshing} />
      <Populated data={payload.data} />
    </s-page>
  );
}
