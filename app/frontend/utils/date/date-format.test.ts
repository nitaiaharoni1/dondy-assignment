import { describe, expect, it } from "vitest";

import { formatDateTime } from "./date-format";

describe("formatDateTime", () => {
  it("formats a valid timestamp", () => {
    const formatted = formatDateTime("2026-09-22T12:00:00Z");
    expect(formatted).not.toBe("2026-09-22T12:00:00Z");
    expect(formatted).toContain("2026");
  });

  it("shows the raw text when the timestamp is invalid", () => {
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
  });
});
