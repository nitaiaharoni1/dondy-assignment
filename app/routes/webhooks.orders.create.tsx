import type { ActionFunctionArgs } from "react-router";

import { normalizeOrderPayload } from "../orders/payload.server";
import { OrderPayloadError } from "../orders/payload.server";
import { ingestOrderCreate } from "../orders/ingest.server";
import { authenticateWebhookRequest } from "../webhooks/authenticate.server";
import { logWebhook } from "../webhooks/log.server";
import { shopLogToken } from "../webhooks/log.server";

const TOPIC = "ORDERS_CREATE";

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
export const action = async ({ request }: ActionFunctionArgs) => {
  const started = Date.now();
  const auth = await authenticateWebhookRequest(request, TOPIC);
  if (!auth.ok) {
    logWebhook("info", started, {
      outcome: "auth_failed",
      topic: TOPIC,
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
    const outcome =
      result.status === "setup_incomplete" ? "setup_incomplete" : result.status;
    logWebhook("info", started, {
      outcome,
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
};
