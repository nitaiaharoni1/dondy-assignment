import type { ActionFunctionArgs } from "react-router";

import { authenticateWebhookRequest } from "./webhooks-authenticate.server";
import { logWebhook } from "./webhooks-log.server";
import { shopLogToken } from "./webhooks-log.server";

/** Thrown by handlers for payloads Shopify should not retry: maps to 400. */
export class InvalidPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPayloadError";
  }
}

type WebhookDelivery = {
  shop: string;
  webhookId: string;
  topic: string;
  payload: unknown;
};

type WebhookResult = {
  outcome: string;
  status: number;
};

/**
 * Session-independent webhook route: HMAC auth, one log line per delivery,
 * and error mapping. InvalidPayloadError -> 400; anything else -> 503 so
 * Shopify retries the delivery.
 */
export function webhookAction(
  expectedTopic: string,
  handle: (delivery: WebhookDelivery) => Promise<WebhookResult>,
) {
  return async ({ request }: ActionFunctionArgs): Promise<Response> => {
    const started = Date.now();
    const auth = await authenticateWebhookRequest(request, expectedTopic);
    if (!auth.ok) {
      logWebhook("info", started, {
        outcome: "auth_failed",
        topic: expectedTopic,
        reason: auth.failure.reason,
      });
      return new Response(undefined, { status: auth.failure.status });
    }

    const delivery = auth.data;
    const context = {
      topic: delivery.topic,
      webhookId: delivery.webhookId,
      shop: shopLogToken(delivery.shop),
    };
    try {
      const { outcome, status } = await handle(delivery);
      logWebhook("info", started, { ...context, outcome });
      return new Response(undefined, { status });
    } catch (error) {
      if (error instanceof InvalidPayloadError) {
        logWebhook("info", started, {
          ...context,
          outcome: "payload_invalid",
          reason: error.message,
        });
        return new Response(undefined, { status: 400 });
      }
      logWebhook("error", started, {
        ...context,
        outcome: "handler_failed",
        code: error instanceof Error ? error.name : "unknown",
      });
      return new Response(undefined, { status: 503 });
    }
  };
}
