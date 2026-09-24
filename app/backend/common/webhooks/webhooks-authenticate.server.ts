import "@shopify/shopify-api/adapters/web-api";
import "@shopify/shopify-app-react-router/adapters/node";
import { shopifyApi } from "@shopify/shopify-api";
import { ApiVersion } from "@shopify/shopify-api";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;
let webhookApiClient: ReturnType<typeof shopifyApi> | undefined;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Minimal shopifyApi client for HMAC validation only (no session storage). */
function webhookApi() {
  if (webhookApiClient) {
    return webhookApiClient;
  }
  const appUrl = requireEnv("SHOPIFY_APP_URL");
  const hostName = new URL(appUrl).host;

  webhookApiClient = shopifyApi({
    apiKey: requireEnv("SHOPIFY_API_KEY"),
    apiSecretKey: requireEnv("SHOPIFY_API_SECRET"),
    apiVersion: ApiVersion.July26,
    isEmbeddedApp: true,
    hostName,
  });
  return webhookApiClient;
}

type ValidatedWebhook = {
  shop: string;
  topic: string;
  webhookId: string;
  payload: unknown;
};

type WebhookAuthFailure = {
  status: 400 | 401 | 405 | 413;
  reason: string;
};

const PAYLOAD_TOO_LARGE: WebhookAuthFailure = {
  status: 413,
  reason: "payload_too_large",
};

/** Raw body for HMAC. A lying Content-Length still gets buffered before the size check. */
async function readRawBody(
  request: Request,
): Promise<
  { ok: true; rawBody: string } | { ok: false; failure: WebhookAuthFailure }
> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    return { ok: false, failure: PAYLOAD_TOO_LARGE };
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
    return { ok: false, failure: PAYLOAD_TOO_LARGE };
  }
  return { ok: true, rawBody };
}

/** Enforce expected topic, myshopify domain shape, and X-Shopify-Webhook-Id. */
function rejectDelivery(
  validation: { topic: string; domain: string; webhookId: string },
  expectedTopic: string,
): WebhookAuthFailure | null {
  if (validation.topic !== expectedTopic) {
    return { status: 400, reason: "topic_mismatch" };
  }
  if (!SHOP_DOMAIN.test(validation.domain)) {
    return { status: 400, reason: "invalid_shop_domain" };
  }
  if (!validation.webhookId) {
    return { status: 400, reason: "missing_webhook_id" };
  }
  return null;
}

/** HMAC-check the raw body with the SDK, then apply our own delivery rules. */
async function verifyDelivery(
  request: Request,
  rawBody: string,
  expectedTopic: string,
): Promise<
  | { ok: true; delivery: Omit<ValidatedWebhook, "payload"> }
  | { ok: false; failure: WebhookAuthFailure }
> {
  const validation = await webhookApi().webhooks.validate({
    rawBody,
    rawRequest: request,
  });

  if (!validation.valid) {
    const reason = validation.reason;
    if (reason === "invalid_hmac") {
      return { ok: false, failure: { status: 401, reason } };
    }
    return { ok: false, failure: { status: 400, reason } };
  }

  const rejected = rejectDelivery(validation, expectedTopic);
  if (rejected) {
    return { ok: false, failure: rejected };
  }

  return {
    ok: true,
    delivery: {
      shop: validation.domain.toLowerCase(),
      topic: validation.topic,
      webhookId: validation.webhookId,
    },
  };
}

function parsePayload(
  rawBody: string,
): { ok: true; payload: unknown } | { ok: false; failure: WebhookAuthFailure } {
  try {
    return { ok: true, payload: JSON.parse(rawBody) as unknown };
  } catch {
    return { ok: false, failure: { status: 400, reason: "malformed_json" } };
  }
}

/**
 * Session-independent webhook authentication: raw body + official SDK validator.
 * Do not use shopify.authenticate.webhook here: that path can load/refresh tokens.
 * Safe for orders/create and app/uninstalled where we must not touch sessions.
 */
export async function authenticateWebhookRequest(
  request: Request,
  expectedTopic: string,
): Promise<
  | { ok: true; data: ValidatedWebhook }
  | { ok: false; failure: WebhookAuthFailure }
> {
  if (request.method !== "POST") {
    return {
      ok: false,
      failure: { status: 405, reason: "method_not_allowed" },
    };
  }

  const bodyResult = await readRawBody(request);
  if (!bodyResult.ok) {
    return bodyResult;
  }

  const verified = await verifyDelivery(
    request,
    bodyResult.rawBody,
    expectedTopic,
  );
  if (!verified.ok) {
    return verified;
  }

  const parsed = parsePayload(bodyResult.rawBody);
  if (!parsed.ok) {
    return parsed;
  }

  return {
    ok: true,
    data: { ...verified.delivery, payload: parsed.payload },
  };
}
