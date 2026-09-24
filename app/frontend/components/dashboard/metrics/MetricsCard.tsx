export function MetricsCard({
  heading,
  value,
}: {
  heading: string;
  value: string;
}) {
  return (
    <s-section heading={heading}>
      <s-heading>{value}</s-heading>
    </s-section>
  );
}
