import type { ActionFunctionArgs } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "../../common/shopify/shopify-app.server";
import { authenticateWebhookRequest } from "../../common/webhooks/webhooks-authenticate.server";
import { logWebhook } from "../../common/webhooks/webhooks-log.server";
import { shopLogToken } from "../../common/webhooks/webhooks-log.server";
import type { DashboardPayload } from "../../../shared/types/dashboard";
import { ensureShopRegistered } from "../shops/shops-service.server";
import { normalizeOrderPayload } from "./domain/domain-payload.server";
import { OrderPayloadError } from "./domain/domain-payload.server";
import { getDashboardForShop } from "./orders-service.server";
import { ingestOrderCreate } from "./orders-service.server";

const ORDERS_CREATE_TOPIC = "ORDERS_CREATE";

function invalidReason(error: unknown): string {
  if (error instanceof OrderPayloadError) {
    return error.message;
  }
  return "invalid_payload";
}

/**
 * ORDERS_CREATE: raw-body HMAC via authenticateWebhookRequest (not
 * authenticate.webhook, which can refresh tokens). setup_incomplete -> 503 so
 * Shopify retries until Shop registration finishes; duplicate -> 200.
 */
export async function orderCreatedWebhook({
  request,
}: ActionFunctionArgs): Promise<Response> {
  const started = Date.now();
  const auth = await authenticateWebhookRequest(request, ORDERS_CREATE_TOPIC);
  if (!auth.ok) {
    logWebhook("info", started, {
      outcome: "auth_failed",
      topic: ORDERS_CREATE_TOPIC,
      reason: auth.failure.reason,
    });
    return new Response(undefined, { status: auth.failure.status });
  }

  const { shop, webhookId, topic, payload } = auth.data;
  let order;
  try {
    order = normalizeOrderPayload(payload);
  } catch (error) {
    logWebhook("info", started, {
      outcome: "payload_invalid",
      topic,
      webhookId,
      shop: shopLogToken(shop),
      reason: invalidReason(error),
    });
    return new Response(undefined, { status: 400 });
  }

  try {
    const result = await ingestOrderCreate({ shop, webhookId, topic, order });
    logWebhook("info", started, {
      outcome: result.status,
      topic,
      webhookId,
      shop: shopLogToken(shop),
    });
    const status = result.status === "setup_incomplete" ? 503 : 200;
    return new Response(undefined, { status });
  } catch (error) {
    logWebhook("error", started, {
      outcome: "persist_failed",
      topic,
      webhookId,
      shop: shopLogToken(shop),
      code: error instanceof Error ? error.name : "unknown",
    });
    return new Response(undefined, { status: 503 });
  }
}

/**
 * Embedded app home: ensure Shop is registered, then load dashboard metrics.
 * Registration failure is a soft error payload so the UI can show retry copy.
 */
export async function dashboardLoader({
  request,
}: LoaderFunctionArgs): Promise<DashboardPayload> {
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
}
