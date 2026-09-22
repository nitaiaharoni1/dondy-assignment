import { z } from "zod";

import { isCodOrder } from "./cod";
import { MoneyError, toMinorUnits } from "./money";

const MAX_GATEWAYS = 32;
const MAX_GATEWAY_LENGTH = 128;
const MAX_NAME_LENGTH = 128;

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

function idFromGraphql(
  adminGraphqlApiId: string | undefined,
): string | undefined {
  if (adminGraphqlApiId === undefined) {
    return undefined;
  }
  const match = GRAPHQL_ORDER_ID.exec(adminGraphqlApiId);
  if (!match?.[1]) {
    throw new OrderPayloadError("Invalid admin_graphql_api_id");
  }
  return match[1];
}

function idFromNumber(rawId: number): string {
  if (!Number.isInteger(rawId) || rawId <= 0) {
    throw new OrderPayloadError("Numeric order id must be a positive integer");
  }
  if (!Number.isSafeInteger(rawId)) {
    throw new OrderPayloadError(
      "Numeric order id exceeds JavaScript safe integer range",
    );
  }
  return String(rawId);
}

function idFromString(rawId: string): string {
  const trimmed = rawId.trim();
  if (!/^\d+$/.test(trimmed) || trimmed === "0") {
    throw new OrderPayloadError("String order id must be a positive decimal");
  }
  return trimmed;
}

function normalizeOrderId(
  adminGraphqlApiId: string | undefined,
  rawId: string | number | undefined,
): string {
  const fromGraphql = idFromGraphql(adminGraphqlApiId);
  let fromId: string | undefined;
  if (typeof rawId === "number") {
    fromId = idFromNumber(rawId);
  } else if (typeof rawId === "string") {
    fromId = idFromString(rawId);
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

function normalizeGateways(names: string[]): string[] {
  const gateways: string[] = [];
  for (const name of names) {
    if (name.length > MAX_GATEWAY_LENGTH) {
      throw new OrderPayloadError("Payment gateway name is too long");
    }
    const trimmed = name.trim();
    if (trimmed.length > 0) {
      gateways.push(trimmed);
    }
  }
  return gateways;
}

function orderCreatedAt(value: string): Date {
  const createdAt = new Date(value);
  if (Number.isNaN(createdAt.getTime())) {
    throw new OrderPayloadError("Invalid created_at timestamp");
  }
  return createdAt;
}

function orderTotal(amount: string, currency: string): bigint {
  try {
    return toMinorUnits(amount, currency);
  } catch (error) {
    if (error instanceof MoneyError) {
      throw new OrderPayloadError(error.message);
    }
    throw error;
  }
}

export function normalizeOrderPayload(input: unknown): NormalizedOrder {
  const parsed = orderPayloadSchema.safeParse(input);
  if (!parsed.success) {
    throw new OrderPayloadError(
      parsed.error.issues[0]?.message ?? "Invalid payload",
    );
  }

  const data = parsed.data;
  const gateways = normalizeGateways(data.payment_gateway_names);
  const name = data.name.trim();
  if (name.length === 0) {
    throw new OrderPayloadError("Order name is required");
  }

  const createdAt = orderCreatedAt(data.created_at);
  const totalMinor = orderTotal(data.total_price, data.currency);

  const financialStatus =
    data.financial_status === undefined || data.financial_status === null
      ? null
      : data.financial_status;

  const orderId = normalizeOrderId(data.admin_graphql_api_id, data.id);

  return {
    orderId,
    name,
    totalMinor,
    currency: data.currency,
    gateways,
    createdAt,
    isCod: isCodOrder(gateways, financialStatus),
  };
}
