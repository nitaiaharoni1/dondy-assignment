import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "../../common/shopify/shopify-app.server";
import { webhookAction } from "../../common/webhooks/webhooks-handler.server";
import type { DashboardPayload } from "../../../shared/types/dashboard";
import { ingestOrderWebhook } from "./orders-service.server";
import { loadDashboard } from "./orders-service.server";

/**
 * ORDERS_CREATE: raw-body HMAC via webhookAction (not authenticate.webhook,
 * which can refresh tokens). setup_incomplete -> 503 so Shopify retries until
 * Shop registration finishes; duplicate -> 200.
 */
export const orderCreatedWebhook = webhookAction(
  "ORDERS_CREATE",
  async (delivery) => {
    const result = await ingestOrderWebhook(delivery);
    const status = result.status === "setup_incomplete" ? 503 : 200;
    return { outcome: result.status, status };
  },
);

/** Unexpected failures throw to the route ErrorBoundary. */
export async function dashboardLoader({
  request,
}: LoaderFunctionArgs): Promise<DashboardPayload> {
  const { session } = await authenticate.admin(request);
  return loadDashboard(session.shop);
}
