import { boundary } from "@shopify/shopify-app-react-router/server";
import type { HeadersFunction } from "react-router";
import { isRouteErrorResponse } from "react-router";
import { useLoaderData } from "react-router";
import { useRouteError } from "react-router";

import { dashboardLoader } from "../../../backend/modules/orders/orders-controller.server";
import { DashboardError } from "../../pages/dashboard/DashboardPage";
import { DashboardPage } from "../../pages/dashboard/DashboardPage";

export const loader = dashboardLoader;

export default function DashboardRoute() {
  return <DashboardPage payload={useLoaderData<typeof loader>()} />;
}

/** Shopify auth responses keep their own handling; anything else gets retry copy. */
export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return boundary.error(error);
  }
  return (
    <DashboardError message="Could not load order metrics. Try refresh in a moment." />
  );
}

/** Embedded admin responses must not be cached by the browser or CDN. */
export const headers: HeadersFunction = (headersArgs) => {
  const headers = boundary.headers(headersArgs);
  headers.set("Cache-Control", "private, no-store");
  return headers;
};
