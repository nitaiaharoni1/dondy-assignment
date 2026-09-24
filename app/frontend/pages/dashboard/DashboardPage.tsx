import { useNavigation } from "react-router";
import { useRevalidator } from "react-router";

import { DashboardContent } from "../../components/dashboard/DashboardContent";
import { DashboardRefreshButton } from "../../components/dashboard/DashboardRefreshButton";
import type { DashboardPayload } from "../../../shared/types/dashboard";

/**
 * Render success or soft-failure dashboard payload from the home loader.
 * Refresh uses revalidator so metrics reload without a full navigation.
 */
export function DashboardPage({ payload }: { payload: DashboardPayload }) {
  const revalidator = useRevalidator();
  const navigation = useNavigation();
  const refreshing =
    revalidator.state === "loading" || navigation.state === "loading";

  if (!payload.ok) {
    return (
      <s-page heading="COD Order Watch">
        <s-section heading="Could not load metrics">
          <s-paragraph>{payload.error}</s-paragraph>
          <s-button
            onClick={() => {
              revalidator.revalidate();
            }}
            {...(refreshing ? { loading: true } : {})}
          >
            Refresh
          </s-button>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="COD Order Watch">
      <DashboardRefreshButton refreshing={refreshing} />
      <DashboardContent data={payload.data} />
    </s-page>
  );
}
