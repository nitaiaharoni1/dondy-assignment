import type { NormalizedOrder } from "../app/backend/modules/orders/domain/domain-payload.server";

const TEST_SECRET = "cod-order-watch-test-secret-not-real";
const TEST_API_KEY = "cod-order-watch-test-api-key";
const TEST_APP_URL = "https://cod-order-watch.test";

export const FIXED_BODY =
  '{"id":"1001","admin_graphql_api_id":"gid://shopify/Order/1001","name":"#1001","total_price":"12.34","currency":"USD","payment_gateway_names":["Cash on Delivery"],"financial_status":"pending","created_at":"2026-09-22T12:00:00Z"}';
export const FIXED_HMAC = "qCes9mylIhtXkEwiXyvSPtD8Y8UGqVkyCRKOm8GWm2I=";
export const MALFORMED_JSON_BODY = "{";
export const MALFORMED_JSON_HMAC =
  "t1tE3NVjgIZCb+XuXOS6O0q8TkYTn6iB3kemkfkszJ4=";
export const UNINSTALL_BODY = '{"ok":true}';
export const UNINSTALL_HMAC = "UEM43rn6NrTn6x4B8qnhhxmpuBS4rcitUg21v3Sb4yM=";
export const INVALID_ORDER_BODY = '{"id":"42","name":"#42"}';
export const INVALID_ORDER_HMAC =
  "xxhAWK6cmow9i7GBs9AXdyq09tl5WgzRvyKupYwwJUc=";

export function applyWebhookTestEnv(): void {
  process.env.SHOPIFY_API_KEY = TEST_API_KEY;
  process.env.SHOPIFY_API_SECRET = TEST_SECRET;
  process.env.SHOPIFY_APP_URL = TEST_APP_URL;
}

export function orderFixture(
  overrides: Partial<NormalizedOrder> = {},
): NormalizedOrder {
  return {
    orderId: "1001",
    name: "#1001",
    totalMinor: 1234n,
    currency: "USD",
    gateways: ["Cash on Delivery"],
    createdAt: new Date("2026-09-22T12:00:00Z"),
    isCod: true,
    ...overrides,
  };
}

export function actionArgs(request: Request) {
  return {
    request,
    url: new URL(request.url),
    pattern: new URL(request.url).pathname,
    params: {},
    context: {},
  };
}

export function signedRequest(
  body: string,
  hmac: string,
  extras: { shop?: string; topic?: string; webhookId?: string } = {},
): Request {
  return new Request("https://cod-order-watch.test/webhooks/orders/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Topic": extras.topic ?? "orders/create",
      "X-Shopify-Hmac-Sha256": hmac,
      "X-Shopify-Shop-Domain": extras.shop ?? "demo-shop.myshopify.com",
      "X-Shopify-API-Version": "2026-07",
      "X-Shopify-Webhook-Id": extras.webhookId ?? "delivery-1",
    },
    body,
  });
}
