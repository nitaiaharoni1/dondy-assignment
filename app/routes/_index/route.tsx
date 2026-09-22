import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>COD Order Watch</h1>
        <p className={styles.text}>
          See which new orders are cash on delivery, for the shop that installed
          this app.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Signed deliveries.</strong> An orders/create webhook is
            checked before anything is stored.
          </li>
          <li>
            <strong>One count per order.</strong> Sending the same delivery
            again does not increase the total.
          </li>
          <li>
            <strong>This shop only.</strong> The dashboard shows the signed-in
            store.
          </li>
        </ul>
      </div>
    </div>
  );
}
