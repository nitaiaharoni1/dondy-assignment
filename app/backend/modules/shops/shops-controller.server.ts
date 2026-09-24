import { webhookAction } from "../../common/webhooks/webhooks-handler.server";
import { purgeShopData } from "./shops-service.server";

/**
 * APP_UNINSTALLED: same session-independent HMAC path as orders/create.
 * Purge sessions and Shop (orders/receipts cascade); safe if already gone.
 */
export const appUninstalledWebhook = webhookAction(
  "APP_UNINSTALLED",
  async ({ shop }) => {
    await purgeShopData(shop);
    return { outcome: "uninstalled", status: 200 };
  },
);
