import { createHash } from "node:crypto";

type LogLevel = "info" | "error";

type LogValue = string | number;

/** Opaque shop token for logs: sha256 prefix, never the raw myshopify domain. */
export function shopLogToken(shop: string): string {
  const digest = createHash("sha256").update(shop).digest("hex").slice(0, 12);
  return `shop_${digest}`;
}

/** One JSON line per webhook outcome, including durationMs from `started`. */
export function logWebhook(
  level: LogLevel,
  started: number,
  fields: Record<string, LogValue>,
): void {
  const line = JSON.stringify({
    ...fields,
    durationMs: Date.now() - started,
  });
  if (level === "error") {
    console.error(line);
    return;
  }
  console.info(line);
}
