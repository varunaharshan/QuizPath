import { describe, expect, it } from "vitest";
import { formatShortDate } from "@/lib/format";

describe("formatShortDate", () => {
  it("formats a fixed date deterministically, regardless of environment locale", () => {
    expect(formatShortDate(new Date("2026-07-09T12:00:00Z"))).toBe("Jul 9");
  });

  it("pads neither the month nor the day (numeric day, short month)", () => {
    expect(formatShortDate(new Date("2026-01-05T12:00:00Z"))).toBe("Jan 5");
  });
});
