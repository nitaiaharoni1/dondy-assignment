import type { ActionFunctionArgs } from "react-router";

import { authenticateWebhookRequest } from "../../common/webhooks/webhooks-authenticate.server";
import { logWebhook } from "../../common/webhooks/webhooks-log.server";
import { shopLogToken } from "../../common/webhooks/webhooks-log.server";
import { purgeShopData } from "./shops-service.server";

const UNINSTALLED_TOPIC = "APP_UNINSTALLED";

/**
 * APP_UNINSTALLED: same session-independent HMAC path as orders/create.
 * Purge sessions and Shop (orders/receipts cascade); safe if already gone.
 */
export async function appUninstalledWebhook({
  request,
}: ActionFunctionArgs): Promise<Response> {
  const started = Date.now();
  const auth = await authenticateWebhookRequest(request, UNINSTALLED_TOPIC);
  if (!auth.ok) {
    logWebhook("info", started, {
      outcome: "auth_failed",
      topic: UNINSTALLED_TOPIC,
      reason: auth.failure.reason,
    });
    return new Response(undefined, { status: auth.failure.status });
  }

  const { shop, webhookId, topic } = auth.data;
  try {
    await purgeShopData(shop);
    logWebhook("info", started, {
      outcome: "uninstalled",
      topic,
      webhookId,
      shop: shopLogToken(shop),
    });
    return new Response(undefined, { status: 200 });
  } catch (error) {
    logWebhook("error", started, {
      outcome: "uninstall_failed",
      topic,
      webhookId,
      shop: shopLogToken(shop),
      code: error instanceof Error ? error.name : "unknown",
    });
    return new Response(undefined, { status: 503 });
  }
}
