import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { grades, paperTypes } from "@/db/schema";
import {
  getGrades,
  getPaperTypes,
  isDuplicateName,
  isValidGrade,
  isValidMedium,
  isValidPaperType,
  labelForGrade,
  labelForPaperType,
  nextSortOrder,
  resolveMediumValue,
  type Grade,
  type PaperType,
} from "@/lib/reference-data";

describe("getGrades", () => {
  it("orders by sortOrder, not insertion order", async () => {
    const runId = randomUUID().slice(0, 8);
    const [gradeB] = await db
      .insert(grades)
      .values({ value: `zb-${runId}`, label: `Grade B ${runId}`, sortOrder: 9998 })
      .returning();
    const [gradeA] = await db
      .insert(grades)
      .values({ value: `za-${runId}`, label: `Grade A ${runId}`, sortOrder: 9997 })
      .returning();

    try {
      const list = await getGrades();
      const indexA = list.findIndex((g) => g.id === gradeA.id);
      const indexB = list.findIndex((g) => g.id === gradeB.id);
      expect(indexA).toBeGreaterThanOrEqual(0);
      expect(indexB).toBeGreaterThanOrEqual(0);
      expect(indexA).toBeLessThan(indexB);
    } finally {
      await db.delete(grades).where(eq(grades.id, gradeA.id));
      await db.delete(grades).where(eq(grades.id, gradeB.id));
    }
  });
});

describe("getPaperTypes", () => {
  it("orders by sortOrder, not insertion order", async () => {
    const runId = randomUUID().slice(0, 8);
    const [typeB] = await db
      .insert(paperTypes)
      .values({ value: `zb-${runId}`, label: `Type B ${runId}`, sortOrder: 9998 })
      .returning();
    const [typeA] = await db
      .insert(paperTypes)
      .values({ value: `za-${runId}`, label: `Type A ${runId}`, sortOrder: 9997 })
      .returning();

    try {
      const list = await getPaperTypes();
      const indexA = list.findIndex((t) => t.id === typeA.id);
      const indexB = list.findIndex((t) => t.id === typeB.id);
      expect(indexA).toBeGreaterThanOrEqual(0);
      expect(indexB).toBeGreaterThanOrEqual(0);
      expect(indexA).toBeLessThan(indexB);
    } finally {
      await db.delete(paperTypes).where(eq(paperTypes.id, typeA.id));
      await db.delete(paperTypes).where(eq(paperTypes.id, typeB.id));
    }
  });

  afterAll(async () => {
    await pool.end();
  });
});

const grade10: Grade = { id: "1", value: "10", label: "Grade 10", sortOrder: 0 };
const grade11: Grade = { id: "2", value: "11", label: "Grade 11", sortOrder: 1 };
const gradeList = [grade10, grade11];

const provincial: PaperType = { id: "1", value: "provincial", label: "Provincial", sortOrder: 0 };
const paperTypeList = [provincial];

describe("isValidGrade", () => {
  it("accepts a value present in the list", () => {
    expect(isValidGrade("10", gradeList)).toBe(true);
    expect(isValidGrade("11", gradeList)).toBe(true);
  });

  it("rejects a value not in the list, including an empty list", () => {
    expect(isValidGrade("9", gradeList)).toBe(false);
    expect(isValidGrade("", gradeList)).toBe(false);
    expect(isValidGrade("10", [])).toBe(false);
  });
});

describe("isValidPaperType", () => {
  it("accepts a value present in the list", () => {
    expect(isValidPaperType("provincial", paperTypeList)).toBe(true);
  });

  it("rejects anything else, including the mockup's fictional GCSE/Zonal/Model types", () => {
    expect(isValidPaperType("gcse", paperTypeList)).toBe(false);
    expect(isValidPaperType("zonal", paperTypeList)).toBe(false);
    expect(isValidPaperType("", paperTypeList)).toBe(false);
  });
});

describe("labelForGrade", () => {
  it("resolves the matching label", () => {
    expect(labelForGrade("10", gradeList)).toBe("Grade 10");
  });

  it("falls back to the raw value when not found", () => {
    expect(labelForGrade("99", gradeList)).toBe("99");
  });
});

describe("labelForPaperType", () => {
  it("resolves the matching label", () => {
    expect(labelForPaperType("provincial", paperTypeList)).toBe("Provincial");
  });

  it("falls back to the raw value when not found", () => {
    expect(labelForPaperType("unknown", paperTypeList)).toBe("unknown");
  });
});

describe("isDuplicateName", () => {
  it("matches case-insensitively", () => {
    expect(isDuplicateName("science", ["Science"])).toBe(true);
    expect(isDuplicateName("SCIENCE", ["science"])).toBe(true);
  });

  it("returns false when there's no match, including an empty list", () => {
    expect(isDuplicateName("Mathematics", ["Science"])).toBe(false);
    expect(isDuplicateName("Science", [])).toBe(false);
  });
});

describe("nextSortOrder", () => {
  it("continues after the existing max", () => {
    expect(nextSortOrder([{ sortOrder: 0 }, { sortOrder: 3 }, { sortOrder: 1 }])).toBe(4);
  });

  it("starts at 0 for an empty list", () => {
    expect(nextSortOrder([])).toBe(0);
  });
});

describe("isValidMedium", () => {
  it("accepts exactly the three real mediums", () => {
    expect(isValidMedium("sinhala")).toBe(true);
    expect(isValidMedium("tamil")).toBe(true);
    expect(isValidMedium("english")).toBe(true);
  });

  it("rejects anything else, including null and non-string values", () => {
    expect(isValidMedium("klingon")).toBe(false);
    expect(isValidMedium("")).toBe(false);
    expect(isValidMedium(null)).toBe(false);
    expect(isValidMedium(undefined)).toBe(false);
  });
});

// Backs createPaper/updatePaper's medium field (src/app/admin/papers/actions.ts)
// — a pure decision, no DB/Clerk involved, so it's tested directly here
// rather than through the "use server" action file itself (importing that
// into a test drags in Next.js's app-router context, which breaks under
// vitest's plain node environment).
describe("resolveMediumValue", () => {
  it("uses the submitted medium when the subject has no fixedMedium", () => {
    expect(resolveMediumValue(null, "sinhala")).toBe("sinhala");
    expect(resolveMediumValue(null, "tamil")).toBe("tamil");
  });

  it("overrides the submitted medium with the subject's own fixedMedium, regardless of what was submitted", () => {
    expect(resolveMediumValue("english", "sinhala")).toBe("english");
    expect(resolveMediumValue("english", "english")).toBe("english");
  });

  it("rejects an invalid or missing submitted medium when there's no fixedMedium to fall back on", () => {
    expect(() => resolveMediumValue(null, "klingon")).toThrow();
    expect(() => resolveMediumValue(null, null)).toThrow();
  });
});
