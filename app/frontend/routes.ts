import type { RouteConfig } from "@react-router/dev/routes";
import { index } from "@react-router/dev/routes";
import { route } from "@react-router/dev/routes";

export default [
  index("routes/landing/landing-index.tsx"),
  route("app", "routes/app/app-layout.tsx", [
    index("routes/app/app-dashboard.tsx"),
  ]),
  route("auth/login", "routes/auth/auth-login.tsx"),
  route("auth/*", "routes/auth/auth-callback.tsx"),
  route(
    "webhooks/app/scopes_update",
    "routes/webhooks/webhooks-app-scopes-update.ts",
  ),
  route(
    "webhooks/app/uninstalled",
    "routes/webhooks/webhooks-app-uninstalled.ts",
  ),
  route("webhooks/orders/create", "routes/webhooks/webhooks-order-created.ts"),
] satisfies RouteConfig;
