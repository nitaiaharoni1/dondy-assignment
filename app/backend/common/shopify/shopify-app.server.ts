import "@shopify/shopify-app-react-router/adapters/node";
import { ApiVersion } from "@shopify/shopify-app-react-router/server";
import { AppDistribution } from "@shopify/shopify-app-react-router/server";
import { shopifyApp } from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";

import prisma from "../db/db-client.server";
import { registerShopFromSession } from "../../modules/shops/shops-service.server";

// Shopify CLI injects these for `app dev`. Build/typegen may run without them;
// webhook routes still refuse to validate without a real secret.
const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY || "",
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "https://example.com",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  hooks: {
    // Register Shop after OAuth so orders/create can resolve the domain.
    afterAuth: async ({ session }) => {
      await registerShopFromSession(session);
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const login = shopify.login;
