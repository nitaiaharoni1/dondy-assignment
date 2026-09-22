import type { ActionFunctionArgs } from "react-router";

import { purgeShopData } from "../models/shops.server";
import { authenticateWebhookRequest } from "../webhooks.server";
import { shopLogToken } from "../webhooks.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const started = Date.now();
  const auth = await authenticateWebhookRequest(request, "APP_UNINSTALLED");
  if (!auth.ok) {
    console.info(
      JSON.stringify({
        outcome: "auth_failed",
        topic: "APP_UNINSTALLED",
        reason: auth.failure.reason,
        durationMs: Date.now() - started,
      }),
    );
    return new Response(undefined, { status: auth.failure.status });
  }

  const { shop, webhookId, topic } = auth.data;

  try {
    await purgeShopData(shop);
    console.info(
      JSON.stringify({
        outcome: "uninstalled",
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
        outcome: "uninstall_failed",
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
