import "@shopify/shopify-app-react-router/adapters/node";
import { shopifyApi } from "@shopify/shopify-api";
import { ApiVersion } from "@shopify/shopify-api";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

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

async function readBoundedRawBody(
  request: Request,
): Promise<
  { ok: true; rawBody: string } | { ok: false; failure: WebhookAuthFailure }
> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const length = Number(contentLength);
    if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
      return {
        ok: false,
        failure: { status: 413, reason: "payload_too_large" },
      };
    }
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

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { ok: true, rawBody: new TextDecoder("utf-8").decode(merged) };
}

/**
 * Session-independent webhook authentication: raw body + official SDK validator.
 * Does not load, refresh, or persist access tokens.
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

  if (validation.topic !== expectedTopic) {
    return { ok: false, failure: { status: 400, reason: "topic_mismatch" } };
  }

  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(validation.domain)) {
    return {
      ok: false,
      failure: { status: 400, reason: "invalid_shop_domain" },
    };
  }

  if (!validation.webhookId) {
    return {
      ok: false,
      failure: { status: 400, reason: "missing_webhook_id" },
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(bodyResult.rawBody) as unknown;
  } catch {
    return { ok: false, failure: { status: 400, reason: "malformed_json" } };
  }

  return {
    ok: true,
    data: {
      shop: validation.domain.toLowerCase(),
      topic: validation.topic,
      webhookId: validation.webhookId,
      apiVersion: validation.apiVersion,
      payload,
    },
  };
}

export function shopLogToken(shop: string): string {
  // Non-reversible short token for logs (not a secret hash of PII).
  let hash = 0;
  for (let i = 0; i < shop.length; i += 1) {
    hash = (hash * 31 + shop.charCodeAt(i)) >>> 0;
  }
  return `shop_${hash.toString(16)}`;
}
