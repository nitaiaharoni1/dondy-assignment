import type { ActionFunctionArgs } from "react-router";

import { normalizeOrderPayload } from "../domain/order-payload.server";
import { OrderPayloadError } from "../domain/order-payload.server";
import { ingestOrderCreate } from "../models/orders.server";
import { authenticateWebhookRequest } from "../webhooks.server";
import { shopLogToken } from "../webhooks.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const started = Date.now();
  const auth = await authenticateWebhookRequest(request, "ORDERS_CREATE");
  if (!auth.ok) {
    console.info(
      JSON.stringify({
        outcome: "auth_failed",
        topic: "ORDERS_CREATE",
        reason: auth.failure.reason,
        durationMs: Date.now() - started,
      }),
    );
    return new Response(undefined, { status: auth.failure.status });
  }

  const { shop, webhookId, topic, payload } = auth.data;

  let order;
  try {
    order = normalizeOrderPayload(payload);
  } catch (error) {
    const reason =
      error instanceof OrderPayloadError ? error.message : "invalid_payload";
    console.info(
      JSON.stringify({
        outcome: "payload_invalid",
        topic,
        webhookId,
        shop: shopLogToken(shop),
        reason,
        durationMs: Date.now() - started,
      }),
    );
    return new Response(undefined, { status: 400 });
  }

  try {
    const result = await ingestOrderCreate({ shop, webhookId, topic, order });

    if (result.status === "setup_incomplete") {
      console.info(
        JSON.stringify({
          outcome: "setup_incomplete",
          topic,
          webhookId,
          shop: shopLogToken(shop),
          durationMs: Date.now() - started,
        }),
      );
      return new Response(undefined, { status: 503 });
    }

    console.info(
      JSON.stringify({
        outcome: result.status,
        topic,
        webhookId,
        shop: shopLogToken(shop),
        durationMs: Date.now() - started,
      }),
    );
    return new Response(undefined, { status: 200 });
  } catch (error) {
    console.error(
      JSON.stringify({
        outcome: "persist_failed",
        topic,
        webhookId,
        shop: shopLogToken(shop),
        code: error instanceof Error ? error.name : "unknown",
        durationMs: Date.now() - started,
      }),
    );
    return new Response(undefined, { status: 503 });
  }
};
