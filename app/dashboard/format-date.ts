/**
 * Format an ISO timestamp with the browser locale and timezone.
 * On invalid input, return the raw string so the UI still shows something.
 */
export function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
