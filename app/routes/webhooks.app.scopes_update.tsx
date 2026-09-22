import type { ActionFunctionArgs } from "react-router";

import db from "../db.server";
import { authenticate } from "../shopify.server";
import { shopLogToken } from "../webhooks.server";

function scopeList(payload: unknown): string[] | null {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("current" in payload)
  ) {
    return null;
  }
  const current = payload.current;
  if (!Array.isArray(current)) {
    return null;
  }
  return current.filter((scope): scope is string => typeof scope === "string");
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);
  console.info(
    JSON.stringify({
      outcome: "scopes_update",
      topic,
      shop: shopLogToken(shop),
    }),
  );

  const current = scopeList(payload);
  if (session && current) {
    await db.session.update({
      where: {
        id: session.id,
      },
      data: {
        scope: current.toString(),
      },
    });
  }
  return new Response();
};
