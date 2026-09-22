import type { HeadersFunction } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import type { DashboardPayload } from "../dashboard/DashboardPage";
import { DashboardPage } from "../dashboard/DashboardPage";
import { getDashboardForShop } from "../orders/dashboard.server";
import { ensureShopRegistered } from "../orders/shops.server";
import { authenticate } from "../shopify.server";

/**
 * Embedded app home: ensure Shop is registered, then load dashboard metrics.
 * Registration failure is a soft error payload so the UI can show retry copy.
 */
export const loader = async ({
  request,
}: LoaderFunctionArgs): Promise<DashboardPayload> => {
  const { session } = await authenticate.admin(request);

  try {
    const registration = await ensureShopRegistered(session.shop);
    if (!registration.ok) {
      return {
        ok: false,
        error:
          "This store is authenticated but the installation record is not ready yet. Open the app again in a moment.",
      };
    }
    return { ok: true, data: await getDashboardForShop(session.shop) };
  } catch {
    return {
      ok: false,
      error: "Could not load order metrics. Try refresh in a moment.",
    };
  }
};

export default function Index() {
  return <DashboardPage payload={useLoaderData<typeof loader>()} />;
}

/** Embedded admin responses must not be cached by the browser or CDN. */
export const headers: HeadersFunction = (headersArgs) => {
  const headers = boundary.headers(headersArgs);
  headers.set("Cache-Control", "private, no-store");
  return headers;
};
