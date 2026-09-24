import type { Session } from "@shopify/shopify-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginErrorType } from "@shopify/shopify-app-react-router/server";

import { updateSessionScope } from "./auth-repository.server";
import { loginErrorMessage } from "./auth-service.server";
import { updateSessionScopes } from "./auth-service.server";

vi.mock("./auth-repository.server", () => ({
  updateSessionScope: vi.fn(),
}));

describe("loginErrorMessage", () => {
  it("explains a missing or invalid shop domain", () => {
    expect(loginErrorMessage({ shop: LoginErrorType.MissingShop })).toEqual({
      shop: "Please enter your shop domain to log in",
    });
    expect(loginErrorMessage({ shop: LoginErrorType.InvalidShop })).toEqual({
      shop: "Please enter a valid shop domain to log in",
    });
  });

  it("returns no message when there is no error", () => {
    expect(loginErrorMessage({})).toEqual({});
  });
});

describe("updateSessionScopes", () => {
  const session = { id: "offline_demo-shop.myshopify.com" } as Session;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores the current scopes as a comma list and drops non-strings", async () => {
    await updateSessionScopes(session, {
      current: ["read_orders", 7, "write_orders"],
    });
    expect(updateSessionScope).toHaveBeenCalledWith(
      session.id,
      "read_orders,write_orders",
    );
  });

  it("stores an empty scope when every scope was revoked", async () => {
    await updateSessionScopes(session, { current: [] });
    expect(updateSessionScope).toHaveBeenCalledWith(session.id, "");
  });

  it.each([
    ["null", null],
    ["a string", "read_orders"],
    ["a non-array current", { current: "read_orders" }],
    ["a missing current", { previous: ["read_orders"] }],
  ])("ignores a payload that is %s", async (_label, payload) => {
    await updateSessionScopes(session, payload);
    expect(updateSessionScope).not.toHaveBeenCalled();
  });

  it("ignores a delivery without a session", async () => {
    await updateSessionScopes(undefined, { current: ["read_orders"] });
    expect(updateSessionScope).not.toHaveBeenCalled();
  });
});
