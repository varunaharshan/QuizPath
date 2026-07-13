import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { mcqs, papers, subjects } from "@/db/schema";
import { getPaperForAdmin, getPapersForAdmin } from "@/lib/admin-papers";
import { textOptions } from "./helpers";

describe("getPapersForAdmin", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectAId: string;
  let subjectBId: string;
  let paperA10Id: string;
  let paperA11Id: string;
  let paperB10Id: string;

  beforeAll(async () => {
    const [subjectA] = await db
      .insert(subjects)
      .values({ name: `Test AdminPapers Subject A ${runId}` })
      .returning();
    subjectAId = subjectA.id;

    const [subjectB] = await db
      .insert(subjects)
      .values({ name: `Test AdminPapers Subject B ${runId}` })
      .returning();
    subjectBId = subjectB.id;

    const [paperA10] = await db
      .insert(papers)
      .values({
        subjectId: subjectAId,
        grade: "10",
        medium: "english",
        paperType: "provincial",
        title: `Western Province Paper ${runId}`,
        status: "published",
      })
      .returning();
    paperA10Id = paperA10.id;

    const [paperA11] = await db
      .insert(papers)
      .values({
        subjectId: subjectAId,
        grade: "11",
        medium: "english",
        paperType: "district",
        title: `Colombo District Paper ${runId}`,
        status: "draft",
      })
      .returning();
    paperA11Id = paperA11.id;

    const [paperB10] = await db
      .insert(papers)
      .values({
        subjectId: subjectBId,
        grade: "10",
        medium: "english",
        paperType: "school",
        title: `School Term Paper ${runId}`,
        status: "draft",
      })
      .returning();
    paperB10Id = paperB10.id;

    // Two mcqs tagged to paperA10 (via paper_id), none on the others.
    await db.insert(mcqs).values([
      { paperId: paperA10Id, questionText: "Q1", options: textOptions("A", "B"), correctOption: 0, status: "published" },
      { paperId: paperA10Id, questionText: "Q2", options: textOptions("A", "B"), correctOption: 0, status: "draft" },
    ]);
  });

  afterAll(async () => {
    await db.delete(subjects).where(eq(subjects.id, subjectAId));
    await db.delete(subjects).where(eq(subjects.id, subjectBId));
  });

  it("returns every paper with subject name and live question count when unfiltered", async () => {
    const result = await getPapersForAdmin({});
    const ours = result.filter((p) => [paperA10Id, paperA11Id, paperB10Id].includes(p.id));
    expect(ours).toHaveLength(3);

    const a10 = ours.find((p) => p.id === paperA10Id)!;
    expect(a10.subjectName).toBe(`Test AdminPapers Subject A ${runId}`);
    expect(a10.grade).toBe("10");
    expect(a10.medium).toBe("english");
    expect(a10.status).toBe("published");
    expect(a10.questionCount).toBe(2); // published + draft both count

    const a11 = ours.find((p) => p.id === paperA11Id)!;
    expect(a11.questionCount).toBe(0);
  });

  it("filters by subjectId", async () => {
    const result = await getPapersForAdmin({ subjectId: subjectAId });
    expect(result.map((p) => p.id).sort()).toEqual([paperA10Id, paperA11Id].sort());
  });

  it("filters by grade", async () => {
    const result = await getPapersForAdmin({ grade: "11" });
    expect(result.some((p) => p.id === paperA11Id)).toBe(true);
    expect(result.some((p) => p.id === paperA10Id)).toBe(false);
    expect(result.some((p) => p.id === paperB10Id)).toBe(false);
  });

  it("filters by a case-insensitive search substring against the title", async () => {
    const result = await getPapersForAdmin({ search: "western province" });
    expect(result.map((p) => p.id)).toEqual([paperA10Id]);
  });

  it("combines subject, grade, and search filters", async () => {
    const result = await getPapersForAdmin({ subjectId: subjectAId, grade: "10", search: runId });
    expect(result.map((p) => p.id)).toEqual([paperA10Id]);
  });
});

describe("getPaperForAdmin", () => {
  it("returns a single paper's details by id, or null if not found", async () => {
    const runId = randomUUID().slice(0, 8);
    const [subject] = await db.insert(subjects).values({ name: `Test AdminPapers Detail Subject ${runId}` }).returning();
    const [paper] = await db
      .insert(papers)
      .values({
        subjectId: subject.id,
        grade: "10",
        medium: "english",
        paperType: "provincial",
        title: `Detail Paper ${runId}`,
        year: 2023,
      })
      .returning();

    try {
      const detail = await getPaperForAdmin(paper.id);
      expect(detail).toMatchObject({
        id: paper.id,
        title: `Detail Paper ${runId}`,
        subjectId: subject.id,
        grade: "10",
        medium: "english",
        paperType: "provincial",
        year: 2023,
        status: "draft",
      });

      expect(await getPaperForAdmin(randomUUID())).toBeNull();
    } finally {
      await db.delete(subjects).where(eq(subjects.id, subject.id));
    }
  });

  afterAll(async () => {
    await pool.end();
  });
});
