import { z } from "zod";

import { isCodOrder } from "./cod";
import { MoneyError, toMinorUnits } from "./money";

const MAX_GATEWAYS = 32;
const MAX_GATEWAY_LENGTH = 128;
const MAX_NAME_LENGTH = 128;

const gatewaySchema = z
  .string()
  .max(MAX_GATEWAY_LENGTH)
  .transform((value) => value.trim())
  .refine((value) => value.length > 0, "Gateway names must be non-empty");

const orderPayloadSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  admin_graphql_api_id: z.string().optional(),
  name: z.string().min(1).max(MAX_NAME_LENGTH),
  total_price: z.string().min(1),
  currency: z
    .string()
    .min(3)
    .max(3)
    .transform((value) => value.toUpperCase()),
  payment_gateway_names: z.array(z.string()).max(MAX_GATEWAYS),
  financial_status: z.string().nullable().optional(),
  created_at: z.string().min(1),
});

export type NormalizedOrder = {
  orderId: string;
  name: string;
  totalMinor: bigint;
  currency: string;
  gateways: string[];
  createdAt: Date;
  isCod: boolean;
};

export class OrderPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderPayloadError";
  }
}

const GRAPHQL_ORDER_ID = /^gid:\/\/shopify\/Order\/(\d+)$/;

function normalizeOrderId(
  adminGraphqlApiId: string | undefined,
  rawId: string | number | undefined,
): string {
  let fromGraphql: string | undefined;
  if (adminGraphqlApiId !== undefined) {
    const match = GRAPHQL_ORDER_ID.exec(adminGraphqlApiId);
    if (!match?.[1]) {
      throw new OrderPayloadError("Invalid admin_graphql_api_id");
    }
    fromGraphql = match[1];
  }

  let fromId: string | undefined;
  if (rawId !== undefined) {
    if (typeof rawId === "number") {
      if (!Number.isInteger(rawId) || rawId <= 0) {
        throw new OrderPayloadError(
          "Numeric order id must be a positive integer",
        );
      }
      if (!Number.isSafeInteger(rawId)) {
        throw new OrderPayloadError(
          "Numeric order id exceeds JavaScript safe integer range",
        );
      }
      fromId = String(rawId);
    } else {
      const trimmed = rawId.trim();
      if (!/^\d+$/.test(trimmed) || trimmed === "0") {
        throw new OrderPayloadError(
          "String order id must be a positive decimal",
        );
      }
      fromId = trimmed;
    }
  }

  if (fromGraphql && fromId && fromGraphql !== fromId) {
    throw new OrderPayloadError("Order id fields disagree");
  }

  const orderId = fromGraphql ?? fromId;
  if (!orderId) {
    throw new OrderPayloadError("Order id is required");
  }
  return orderId;
}

export function normalizeOrderPayload(input: unknown): NormalizedOrder {
  const parsed = orderPayloadSchema.safeParse(input);
  if (!parsed.success) {
    throw new OrderPayloadError(
      parsed.error.issues[0]?.message ?? "Invalid payload",
    );
  }

  const data = parsed.data;
  const gatewaysParsed = z
    .array(gatewaySchema)
    .safeParse(data.payment_gateway_names);
  if (!gatewaysParsed.success) {
    throw new OrderPayloadError("Invalid payment_gateway_names");
  }

  const createdAt = new Date(data.created_at);
  if (Number.isNaN(createdAt.getTime())) {
    throw new OrderPayloadError("Invalid created_at timestamp");
  }

  let totalMinor: bigint;
  try {
    totalMinor = toMinorUnits(data.total_price, data.currency);
  } catch (error) {
    if (error instanceof MoneyError) {
      throw new OrderPayloadError(error.message);
    }
    throw error;
  }

  const financialStatus =
    data.financial_status === undefined || data.financial_status === null
      ? null
      : data.financial_status;

  const gateways = gatewaysParsed.data;
  const orderId = normalizeOrderId(data.admin_graphql_api_id, data.id);

  return {
    orderId,
    name: data.name.trim(),
    totalMinor,
    currency: data.currency,
    gateways,
    createdAt,
    isCod: isCodOrder(gateways, financialStatus),
  };
}
