/**
 * Local demo utility: sign fabricated bytes and POST the same request twice.
 * Requires SHOPIFY_API_SECRET and an explicit destination URL.
 *
 * Usage:
 *   SHOPIFY_API_SECRET=... SHOPIFY_APP_URL=https://CURRENT_TUNNEL \
 *   npx tsx scripts/replay-webhook.ts \
 *     --url https://CURRENT_TUNNEL/webhooks/orders/create \
 *     --shop your-dev-store.myshopify.com
 */
import { createHmac } from "node:crypto";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

const url = arg("--url");
const shop = arg("--shop");
const webhookId = arg("--webhook-id") ?? "demo-replay-1";
const secret = process.env.SHOPIFY_API_SECRET;
const appUrl = process.env.SHOPIFY_APP_URL;

if (!url || !shop || !secret || !appUrl) {
  console.error(
    "Required: --url, --shop, SHOPIFY_API_SECRET, and SHOPIFY_APP_URL",
  );
  process.exit(1);
}

if (!shop.endsWith(".myshopify.com")) {
  console.error("Shop must be a *.myshopify.com domain");
  process.exit(1);
}

let destination: URL;
let allowed: URL;
try {
  destination = new URL(url);
  allowed = new URL(appUrl);
} catch {
  console.error("--url and SHOPIFY_APP_URL must be absolute URLs");
  process.exit(1);
}

const localHost =
  destination.hostname === "localhost" || destination.hostname === "127.0.0.1";
if (destination.protocol !== "https:" && !localHost) {
  console.error("Refusing to send to a non-local http destination");
  process.exit(1);
}

if (destination.host !== allowed.host) {
  console.error(
    "Refusing to send: destination host does not match SHOPIFY_APP_URL",
  );
  process.exit(1);
}

const shopDomain = shop;

const body =
  '{"id":"9001","admin_graphql_api_id":"gid://shopify/Order/9001","name":"#DEMO-9001","total_price":"25.00","currency":"USD","payment_gateway_names":["Cash on Delivery"],"financial_status":"pending","created_at":"2026-09-22T12:00:00Z"}';

const hmac = createHmac("sha256", secret).update(body, "utf8").digest("base64");

async function sendOnce(label: string): Promise<void> {
  const started = Date.now();
  const response = await fetch(destination, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Topic": "orders/create",
      "X-Shopify-Hmac-Sha256": hmac,
      "X-Shopify-Shop-Domain": shopDomain,
      "X-Shopify-API-Version": "2026-07",
      "X-Shopify-Webhook-Id": webhookId,
    },
    body,
  });
  console.log(
    JSON.stringify({
      label,
      status: response.status,
      webhookId,
      durationMs: Date.now() - started,
    }),
  );
}

await sendOnce("first");
await sendOnce("duplicate");
