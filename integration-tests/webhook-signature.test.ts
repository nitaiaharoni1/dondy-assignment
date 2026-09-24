import { beforeEach, describe, expect, it, vi } from "vitest";

import { authenticateWebhookRequest } from "../app/backend/common/webhooks/webhooks-authenticate.server";
import { action as ordersCreateAction } from "../app/frontend/routes/webhooks/webhooks-order-created";
import {
  actionArgs,
  applyWebhookTestEnv,
  FIXED_BODY,
  FIXED_HMAC,
  MALFORMED_JSON_BODY,
  MALFORMED_JSON_HMAC,
  signedRequest,
} from "./webhook-fixtures";

describe("webhook HMAC validation", () => {
  beforeEach(() => {
    applyWebhookTestEnv();
  });

  it("accepts the fixed payload and signature", async () => {
    const result = await authenticateWebhookRequest(
      signedRequest(FIXED_BODY, FIXED_HMAC),
      "ORDERS_CREATE",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.shop).toBe("demo-shop.myshopify.com");
      expect(result.data.webhookId).toBe("delivery-1");
      expect(result.data.topic).toBe("ORDERS_CREATE");
    }
  });

  it("rejects tampered body and bad signatures", async () => {
    const tampered = FIXED_BODY.replace("12.34", "12.35");
    const badBody = await authenticateWebhookRequest(
      signedRequest(tampered, FIXED_HMAC),
      "ORDERS_CREATE",
    );
    expect(badBody.ok).toBe(false);
    if (!badBody.ok) {
      expect(badBody.failure.status).toBe(401);
    }

    const shortSig = await authenticateWebhookRequest(
      signedRequest(FIXED_BODY, "abc"),
      "ORDERS_CREATE",
    );
    expect(shortSig.ok).toBe(false);

    const missing = await authenticateWebhookRequest(
      new Request("https://cod-order-watch.test/webhooks/orders/create", {
        method: "POST",
        body: FIXED_BODY,
      }),
      "ORDERS_CREATE",
    );
    expect(missing.ok).toBe(false);

    const whitespace = await authenticateWebhookRequest(
      signedRequest(`${FIXED_BODY} `, FIXED_HMAC),
      "ORDERS_CREATE",
    );
    expect(whitespace.ok).toBe(false);
    if (!whitespace.ok) {
      expect(whitespace.failure.status).toBe(401);
    }
  });

  it("rejects a body larger than the limit", async () => {
    const tooBig = "x".repeat(2 * 1024 * 1024 + 1);
    const result = await authenticateWebhookRequest(
      signedRequest(tooBig, FIXED_HMAC),
      "ORDERS_CREATE",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.status).toBe(413);
    }
  });

  it("rejects the wrong verb, topic, and shop before any write", async () => {
    const getResult = await authenticateWebhookRequest(
      new Request("https://cod-order-watch.test/webhooks/orders/create", {
        method: "GET",
      }),
      "ORDERS_CREATE",
    );
    expect(getResult.ok).toBe(false);
    if (!getResult.ok) {
      expect(getResult.failure.status).toBe(405);
    }

    const wrongTopic = await authenticateWebhookRequest(
      signedRequest(FIXED_BODY, FIXED_HMAC, { topic: "orders/updated" }),
      "ORDERS_CREATE",
    );
    expect(wrongTopic.ok).toBe(false);
    if (!wrongTopic.ok) {
      expect(wrongTopic.failure.status).toBe(400);
    }

    const badShop = await authenticateWebhookRequest(
      signedRequest(FIXED_BODY, FIXED_HMAC, { shop: "evil.example" }),
      "ORDERS_CREATE",
    );
    expect(badShop.ok).toBe(false);
    if (!badShop.ok) {
      expect(badShop.failure.status).toBe(400);
      expect(badShop.failure.reason).toBe("invalid_shop_domain");
    }
  });

  it("rejects a missing delivery id and a fake content length", async () => {
    const missingId = await authenticateWebhookRequest(
      signedRequest(FIXED_BODY, FIXED_HMAC, { webhookId: "" }),
      "ORDERS_CREATE",
    );
    expect(missingId.ok).toBe(false);

    const padded = new Request(
      "https://cod-order-watch.test/webhooks/orders/create",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(3 * 1024 * 1024),
          "X-Shopify-Hmac-Sha256": FIXED_HMAC,
          "X-Shopify-Shop-Domain": "demo-shop.myshopify.com",
          "X-Shopify-Topic": "orders/create",
          "X-Shopify-Webhook-Id": "delivery-1",
        },
        body: FIXED_BODY,
      },
    );
    const tooBig = await authenticateWebhookRequest(padded, "ORDERS_CREATE");
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) {
      expect(tooBig.failure.status).toBe(413);
      expect(tooBig.failure.reason).toBe("payload_too_large");
    }
  });

  it("rejects a signed null body before saving", async () => {
    const response = await ordersCreateAction(
      actionArgs(
        signedRequest("null", "dlDWdj1BRV71zjujyQuNGzj3PeB+egGXQI5f/jcJ2Tg="),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("rejects correctly signed malformed JSON", async () => {
    const result = await authenticateWebhookRequest(
      signedRequest(MALFORMED_JSON_BODY, MALFORMED_JSON_HMAC),
      "ORDERS_CREATE",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.status).toBe(400);
      expect(result.failure.reason).toBe("malformed_json");
    }
  });

  it("rejects a missing shop domain and a quoted shop string", async () => {
    const missingShop = await authenticateWebhookRequest(
      new Request("https://cod-order-watch.test/webhooks/orders/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Hmac-Sha256": FIXED_HMAC,
          "X-Shopify-Topic": "orders/create",
          "X-Shopify-API-Version": "2026-07",
          "X-Shopify-Webhook-Id": "delivery-1",
        },
        body: FIXED_BODY,
      }),
      "ORDERS_CREATE",
    );
    expect(missingShop.ok).toBe(false);
    if (!missingShop.ok) {
      expect(missingShop.failure.status).toBe(400);
      expect(missingShop.failure.reason).toBe("missing_headers");
    }

    const quoted = await authenticateWebhookRequest(
      signedRequest(FIXED_BODY, FIXED_HMAC, {
        shop: 'evil"shop.myshopify.com',
      }),
      "ORDERS_CREATE",
    );
    expect(quoted.ok).toBe(false);
    if (!quoted.ok) {
      expect(quoted.failure.status).toBe(400);
      expect(quoted.failure.reason).toBe("invalid_shop_domain");
    }
  });

  it("lowercases an uppercase shop header", async () => {
    const result = await authenticateWebhookRequest(
      signedRequest(FIXED_BODY, FIXED_HMAC, {
        shop: "Demo-Shop.MyShopify.com",
      }),
      "ORDERS_CREATE",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.shop).toBe("demo-shop.myshopify.com");
    }
  });

  it("rejects an empty body", async () => {
    const result = await authenticateWebhookRequest(
      signedRequest("", FIXED_HMAC),
      "ORDERS_CREATE",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toEqual({ status: 400, reason: "missing_body" });
    }
  });

  it("refuses to validate anything when started without the app secret", async () => {
    delete process.env.SHOPIFY_API_SECRET;
    vi.resetModules();
    const fresh =
      await import("../app/backend/common/webhooks/webhooks-authenticate.server");
    await expect(
      fresh.authenticateWebhookRequest(
        signedRequest(FIXED_BODY, FIXED_HMAC),
        "ORDERS_CREATE",
      ),
    ).rejects.toThrow(/SHOPIFY_API_SECRET/);
  });
});
