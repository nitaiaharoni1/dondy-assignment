import { createHash } from "node:crypto";

type LogLevel = "info" | "error";

type LogValue = string | number;

export function shopLogToken(shop: string): string {
  const digest = createHash("sha256").update(shop).digest("hex").slice(0, 12);
  return `shop_${digest}`;
}

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
