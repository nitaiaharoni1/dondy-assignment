import { beforeEach, describe, expect, it } from "vitest";

import { action as ordersCreateAction } from "../app/routes/webhooks.orders.create";
import { authenticateWebhookRequest } from "../app/webhooks/authenticate.server";
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
});
