import { useActionData } from "react-router";
import { useLoaderData } from "react-router";

import { loginHandler } from "../../../backend/modules/auth/auth-controller.server";
import { LoginPage } from "../../pages/login/LoginPage";

export const loader = loginHandler;

export const action = loginHandler;

export default function LoginRoute() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { errors } = actionData || loaderData;

  return <LoginPage shopError={errors.shop} />;
}
