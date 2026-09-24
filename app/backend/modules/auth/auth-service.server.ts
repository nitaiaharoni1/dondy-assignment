import type { Session } from "@shopify/shopify-api";
import type { LoginError } from "@shopify/shopify-app-react-router/server";
import { LoginErrorType } from "@shopify/shopify-app-react-router/server";

import { updateSessionScope } from "./auth-repository.server";

interface LoginErrorMessage {
  shop?: string;
}

export function loginErrorMessage(loginErrors: LoginError): LoginErrorMessage {
  if (loginErrors?.shop === LoginErrorType.MissingShop) {
    return { shop: "Please enter your shop domain to log in" };
  }

  if (loginErrors?.shop === LoginErrorType.InvalidShop) {
    return { shop: "Please enter a valid shop domain to log in" };
  }

  return {};
}

function currentScopes(payload: unknown): string[] | null {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("current" in payload) ||
    !Array.isArray(payload.current)
  ) {
    return null;
  }

  return payload.current.filter(
    (scope): scope is string => typeof scope === "string",
  );
}

export async function updateSessionScopes(
  session: Session | undefined,
  payload: unknown,
): Promise<void> {
  const scopes = currentScopes(payload);
  if (!session || !scopes) {
    return;
  }

  await updateSessionScope(session.id, scopes.toString());
}
