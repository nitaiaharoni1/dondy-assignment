import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState } from "react";
import { Form } from "react-router";

export function LoginPage({ shopError }: { shopError?: string }) {
  const [shop, setShop] = useState("");

  return (
    <AppProvider embedded={false}>
      <s-page>
        <Form method="post">
          <s-section heading="Log in">
            <s-text-field
              name="shop"
              label="Shop domain"
              details="example.myshopify.com"
              value={shop}
              onChange={(event) => setShop(event.currentTarget.value)}
              autocomplete="on"
              error={shopError}
            ></s-text-field>
            <s-button type="submit">Log in</s-button>
          </s-section>
        </Form>
      </s-page>
    </AppProvider>
  );
}
