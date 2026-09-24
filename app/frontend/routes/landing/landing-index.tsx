import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { useLoaderData } from "react-router";

import { login } from "../../../backend/common/shopify/shopify-app.server";
import { LandingPage } from "../../pages/landing/LandingPage";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showLoginForm: Boolean(login) };
};

export default function LandingRoute() {
  return <LandingPage {...useLoaderData<typeof loader>()} />;
}
