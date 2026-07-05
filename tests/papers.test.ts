import { describe, expect, it } from "vitest";
import { firstNonEmptyPaperType, isValidPaperType, type GroupedPapers } from "@/lib/papers";

function grouped(overrides: Partial<GroupedPapers> = {}): GroupedPapers {
  return { provincial: [], district: [], school: [], ...overrides };
}

const PAPER = {
  id: "p1",
  title: "Test paper",
  year: 2023,
  source: null,
  status: "not_started" as const,
};

describe("isValidPaperType", () => {
  it("accepts exactly the three real paper types", () => {
    expect(isValidPaperType("provincial")).toBe(true);
    expect(isValidPaperType("district")).toBe(true);
    expect(isValidPaperType("school")).toBe(true);
  });

  it("rejects anything else, including the mockup's fictional GCSE/Zonal/Model types", () => {
    expect(isValidPaperType("gcse")).toBe(false);
    expect(isValidPaperType("zonal")).toBe(false);
    expect(isValidPaperType("model")).toBe(false);
    expect(isValidPaperType("")).toBe(false);
  });
});

// Backs the Papers filter form's default Paper Type selection: whichever
// grade+subject was just chosen, the dropdown should default to a type that
// actually has papers rather than landing on an empty one.
describe("firstNonEmptyPaperType", () => {
  it("picks provincial first when it has papers, regardless of what else does", () => {
    const g = grouped({ provincial: [PAPER], district: [PAPER], school: [PAPER] });
    expect(firstNonEmptyPaperType(g)).toBe("provincial");
  });

  it("falls through to district when provincial is empty", () => {
    const g = grouped({ district: [PAPER], school: [PAPER] });
    expect(firstNonEmptyPaperType(g)).toBe("district");
  });

  it("falls through to school when only school has papers", () => {
    const g = grouped({ school: [PAPER] });
    expect(firstNonEmptyPaperType(g)).toBe("school");
  });

  it("defaults to provincial when nothing has any papers", () => {
    expect(firstNonEmptyPaperType(grouped())).toBe("provincial");
  });
});
