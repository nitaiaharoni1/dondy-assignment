import { boundary } from "@shopify/shopify-app-react-router/server";
import type { HeadersFunction } from "react-router";
import { useLoaderData } from "react-router";

import { dashboardLoader } from "../../../backend/modules/orders/orders-controller.server";
import { DashboardPage } from "../../pages/dashboard/DashboardPage";

export const loader = dashboardLoader;

export default function DashboardRoute() {
  return <DashboardPage payload={useLoaderData<typeof loader>()} />;
}

/** Embedded admin responses must not be cached by the browser or CDN. */
export const headers: HeadersFunction = (headersArgs) => {
  const headers = boundary.headers(headersArgs);
  headers.set("Cache-Control", "private, no-store");
  return headers;
};
