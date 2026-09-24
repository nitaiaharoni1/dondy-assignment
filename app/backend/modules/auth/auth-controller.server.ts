import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../../common/shopify/shopify-app.server";
import { login } from "../../common/shopify/shopify-app.server";
import { logWebhook } from "../../common/webhooks/webhooks-log.server";
import { shopLogToken } from "../../common/webhooks/webhooks-log.server";
import { loginErrorMessage } from "./auth-service.server";
import { updateSessionScopes } from "./auth-service.server";

/** Serves both the login page load and its form submit. */
export async function loginHandler({ request }: ActionFunctionArgs) {
  const errors = loginErrorMessage(await login(request));

  return { errors };
}

/**
 * APP_SCOPES_UPDATE: uses authenticate.webhook because we need the session
 * row to persist the new scope list. Unlike orders/create, token refresh is OK here.
 */
export async function scopesUpdateWebhook({
  request,
}: ActionFunctionArgs): Promise<Response> {
  const started = Date.now();
  const { payload, session, topic, shop } = await authenticate.webhook(request);
  logWebhook("info", started, {
    outcome: "scopes_update",
    topic,
    shop: shopLogToken(shop),
  });

  await updateSessionScopes(session, payload);
  return new Response();
}
