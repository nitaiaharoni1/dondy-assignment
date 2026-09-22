import "@shopify/shopify-api/adapters/web-api";
import "@shopify/shopify-app-react-router/adapters/node";
import { shopifyApi } from "@shopify/shopify-api";
import { ApiVersion } from "@shopify/shopify-api";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Minimal shopifyApi client for HMAC validation only (no session storage). */
function webhookApi() {
  const appUrl = requireEnv("SHOPIFY_APP_URL");
  const hostName = new URL(appUrl).host;

  return shopifyApi({
    apiKey: requireEnv("SHOPIFY_API_KEY"),
    apiSecretKey: requireEnv("SHOPIFY_API_SECRET"),
    apiVersion: ApiVersion.July26,
    isEmbeddedApp: true,
    hostName,
  });
}

export type ValidatedWebhook = {
  shop: string;
  topic: string;
  webhookId: string;
  apiVersion: string;
  payload: unknown;
};

export type WebhookAuthFailure = {
  status: 400 | 401 | 405 | 413;
  reason: string;
};

function declaredLengthTooLarge(request: Request): boolean {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) {
    return false;
  }
  const length = Number(contentLength);
  return Number.isFinite(length) && length > MAX_BODY_BYTES;
}

function mergeChunks(chunks: Uint8Array[], total: number): string {
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}

/**
 * Read the request body as a raw UTF-8 string for HMAC.
 * Cap at MAX_BODY_BYTES so a huge Content-Length or stream cannot exhaust memory.
 */
async function readBoundedRawBody(
  request: Request,
): Promise<
  { ok: true; rawBody: string } | { ok: false; failure: WebhookAuthFailure }
> {
  if (declaredLengthTooLarge(request)) {
    return {
      ok: false,
      failure: { status: 413, reason: "payload_too_large" },
    };
  }

  if (!request.body) {
    return { ok: true, rawBody: "" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return {
        ok: false,
        failure: { status: 413, reason: "payload_too_large" },
      };
    }
    chunks.push(value);
  }

  return { ok: true, rawBody: mergeChunks(chunks, total) };
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

  const bodyResult = await readBoundedRawBody(request);
  if (!bodyResult.ok) {
    return bodyResult;
  }

  const api = webhookApi();
  const validation = await api.webhooks.validate({
    rawBody: bodyResult.rawBody,
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

  const parsed = parsePayload(bodyResult.rawBody);
  if (!parsed.ok) {
    return parsed;
  }

  return {
    ok: true,
    data: {
      shop: validation.domain.toLowerCase(),
      topic: validation.topic,
      webhookId: validation.webhookId,
      apiVersion: validation.apiVersion,
      payload: parsed.payload,
    },
  };
}
