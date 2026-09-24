import { useRevalidator } from "react-router";

export function DashboardRefreshButton({
  refreshing,
}: {
  refreshing: boolean;
}) {
  const revalidator = useRevalidator();

  return (
    <s-button
      slot="primary-action"
      onClick={() => {
        revalidator.revalidate();
      }}
      {...(refreshing ? { loading: true, disabled: true } : {})}
    >
      Refresh
    </s-button>
  );
}
