import type { HeadersFunction } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { useNavigation } from "react-router";
import { useRevalidator } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import type { DashboardData } from "../models/orders.server";
import { getDashboardForShop } from "../models/orders.server";
import { ensureShopRegistered } from "../models/shops.server";
import { authenticate } from "../shopify.server";

type LoaderSuccess = {
  ok: true;
  data: DashboardData;
};

type LoaderFailure = {
  ok: false;
  error: string;
};

export const loader = async ({
  request,
}: LoaderFunctionArgs): Promise<LoaderSuccess | LoaderFailure> => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    const registration = await ensureShopRegistered(shop);
    if (!registration.ok) {
      return {
        ok: false,
        error:
          "This store is authenticated but the installation record is not ready yet. Open the app again in a moment.",
      };
    }

    const data = await getDashboardForShop(shop);
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      error: "Could not load order metrics. Try refresh in a moment.",
    };
  }
};

function formatRefreshedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatOrderDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function Index() {
  const payload = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const navigation = useNavigation();
  const refreshing =
    revalidator.state === "loading" || navigation.state === "loading";

  const onRefresh = () => {
    revalidator.revalidate();
  };

  if (!payload.ok) {
    return (
      <s-page heading="COD Order Watch">
        <s-section heading="Could not load metrics">
          <s-paragraph>{payload.error}</s-paragraph>
          <s-button
            onClick={onRefresh}
            {...(refreshing ? { loading: true } : {})}
          >
            Refresh
          </s-button>
        </s-section>
      </s-page>
    );
  }

  const { data } = payload;
  const isEmpty = data.ordersReceived === 0;

  return (
    <s-page heading="COD Order Watch">
      <s-button
        slot="primary-action"
        onClick={onRefresh}
        {...(refreshing ? { loading: true } : {})}
        {...(refreshing ? { disabled: true } : {})}
      >
        Refresh
      </s-button>

      <s-section heading="Snapshot">
        <s-paragraph>
          Counts cover every order this installation accepted from{" "}
          <s-text type="strong">orders/create</s-text> deliveries. Existing
          store orders are not imported automatically. Dates use your browser
          locale and timezone.
        </s-paragraph>
        <s-paragraph>
          Last refreshed: {formatRefreshedAt(data.refreshedAt)}
        </s-paragraph>
      </s-section>

      {isEmpty ? (
        <s-section heading="No orders yet">
          <s-paragraph>
            After installation, new Cash-on-Delivery and other orders appear
            here when Shopify delivers{" "}
            <s-text type="strong">orders/create</s-text>. Create a test order in
            the development store, then refresh.
          </s-paragraph>
        </s-section>
      ) : null}

      <s-section heading="Orders received">
        <s-heading>{String(data.ordersReceived)}</s-heading>
      </s-section>

      <s-section heading="COD orders">
        <s-heading>{String(data.codOrders)}</s-heading>
      </s-section>

      <s-section heading="COD share">
        <s-heading>{data.codSharePercent.toFixed(1)}%</s-heading>
      </s-section>

      <s-section heading="Total order value">
        {data.totalsByCurrency.length === 0 ? (
          <s-paragraph>No received order value yet.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {data.totalsByCurrency.map((row) => (
              <s-paragraph key={row.currency}>
                {row.currency} {row.amount}
              </s-paragraph>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section heading="Latest orders">
        {data.latestOrders.length === 0 ? (
          <s-paragraph>No orders to list yet.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Order</s-table-header>
              <s-table-header>Date</s-table-header>
              <s-table-header>Total</s-table-header>
              <s-table-header>Gateways</s-table-header>
              <s-table-header>COD</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {data.latestOrders.map((order) => (
                <s-table-row key={order.id}>
                  <s-table-cell>{order.name}</s-table-cell>
                  <s-table-cell>
                    {formatOrderDate(order.createdAt)}
                  </s-table-cell>
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
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  const headers = boundary.headers(headersArgs);
  headers.set("Cache-Control", "private, no-store");
  return headers;
};
