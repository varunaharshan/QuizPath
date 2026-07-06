import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { mcqs, modules, subjects, subTopics } from "@/db/schema";
import type { SubTopicStatus } from "@/lib/dashboard";
import {
  getTopKeywords,
  groupTopicsBySubject,
  groupWeakAreasBySubject,
  searchSubTopicIdsByKeyword,
  weakAreas,
} from "@/lib/practice";

function status(overrides: Partial<SubTopicStatus>): SubTopicStatus {
  return {
    id: randomUUID(),
    name: "Topic",
    moduleName: "Module",
    subjectId: "subject-1",
    subjectName: "Science",
    score: null,
    label: "not_started",
    questionsAnswered: 0,
    ...overrides,
  };
}

describe("weakAreas", () => {
  it("keeps only needs_work topics, excluding not_started/in_progress/mastered", () => {
    const needsWork = status({ name: "Weak", label: "needs_work", score: 40 });
    const notStarted = status({ name: "NotStarted", label: "not_started", score: null });
    const inProgress = status({ name: "InProgress", label: "in_progress", score: 70 });
    const mastered = status({ name: "Mastered", label: "mastered", score: 95 });

    const result = weakAreas([needsWork, notStarted, inProgress, mastered]);
    expect(result.map((t) => t.name)).toEqual(["Weak"]);
  });

  it("sorts by score ascending (lowest/most urgent first)", () => {
    const t50 = status({ name: "50", label: "needs_work", score: 50 });
    const t10 = status({ name: "10", label: "needs_work", score: 10 });
    const t35 = status({ name: "35", label: "needs_work", score: 35 });

    const result = weakAreas([t50, t10, t35]);
    expect(result.map((t) => t.name)).toEqual(["10", "35", "50"]);
  });

  it("returns an empty list when nothing needs work", () => {
    expect(weakAreas([status({ label: "mastered", score: 90 })])).toEqual([]);
  });
});

describe("groupTopicsBySubject", () => {
  it("groups every topic by subject regardless of label, preserving each group's original order", () => {
    const sci1 = status({ name: "Sci1", subjectId: "sci", subjectName: "Science", label: "mastered", score: 90 });
    const sci2 = status({ name: "Sci2", subjectId: "sci", subjectName: "Science", label: "not_started", score: null });
    const biz1 = status({ name: "Biz1", subjectId: "biz", subjectName: "Business Studies", label: "needs_work", score: 30 });

    const groups = groupTopicsBySubject([sci1, sci2, biz1]);

    const science = groups.find((g) => g.subjectId === "sci");
    expect(science?.topics.map((t) => t.name)).toEqual(["Sci1", "Sci2"]);
    const business = groups.find((g) => g.subjectId === "biz");
    expect(business?.topics.map((t) => t.name)).toEqual(["Biz1"]);
  });

  it("sorts groups by subject name for a stable, deterministic tab order", () => {
    const biz = status({ name: "B", subjectId: "biz", subjectName: "Business Studies" });
    const geo = status({ name: "G", subjectId: "geo", subjectName: "Geography" });
    const sci = status({ name: "S", subjectId: "sci", subjectName: "Science" });

    const groups = groupTopicsBySubject([sci, biz, geo]);
    expect(groups.map((g) => g.subjectName)).toEqual(["Business Studies", "Geography", "Science"]);
  });

  it("returns an empty list for an empty input", () => {
    expect(groupTopicsBySubject([])).toEqual([]);
  });
});

describe("groupWeakAreasBySubject", () => {
  it("buckets weak topics by subject, each accuracy-averaged and sorted weakest-subject-first", () => {
    const scienceWeak1 = status({ name: "S1", label: "needs_work", score: 20, subjectId: "sci", subjectName: "Science" });
    const scienceWeak2 = status({ name: "S2", label: "needs_work", score: 40, subjectId: "sci", subjectName: "Science" });
    const businessWeak = status({ name: "B1", label: "needs_work", score: 55, subjectId: "biz", subjectName: "Business Studies" });

    const groups = groupWeakAreasBySubject([scienceWeak1, scienceWeak2, businessWeak]);

    expect(groups.map((g) => g.subjectName)).toEqual(["Science", "Business Studies"]);
    expect(groups[0].accuracy).toBe(30);
    expect(groups[0].totalCount).toBe(2);
    expect(groups[1].accuracy).toBe(55);
  });

  it("slices each subject's topics to the given limit but keeps the true totalCount", () => {
    const topics = [10, 20, 30, 40].map((score) =>
      status({ name: `T${score}`, label: "needs_work", score, subjectId: "sci", subjectName: "Science" }),
    );

    const groups = groupWeakAreasBySubject(topics, 2);

    expect(groups[0].topics).toHaveLength(2);
    expect(groups[0].topics.map((t) => t.name)).toEqual(["T10", "T20"]);
    expect(groups[0].totalCount).toBe(4);
  });

  it("never produces a tile for a subject with no weak topics", () => {
    const groups = groupWeakAreasBySubject([]);
    expect(groups).toEqual([]);
  });
});

describe("searchSubTopicIdsByKeyword", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectId: string;
  let moduleId: string;
  let subTopicByNameId: string;
  let subTopicByModuleId: string;
  let subTopicByQuestionId: string;
  let subTopicByKeywordId: string;
  let subTopicUnrelatedId: string;
  let otherGradeSubTopicId: string;
  let keywordTag: string;

  beforeAll(async () => {
    const [subject] = await db
      .insert(subjects)
      .values({ name: `Test Keyword Subject ${runId}` })
      .returning();
    subjectId = subject.id;

    const [testModule] = await db
      .insert(modules)
      .values({ subjectId, grade: "10", name: `Photosynthesis Unit ${runId}`, sortOrder: 0 })
      .returning();
    moduleId = testModule.id;

    const [otherGradeModule] = await db
      .insert(modules)
      .values({ subjectId, grade: "11", name: `Other Grade Module ${runId}`, sortOrder: 0 })
      .returning();

    const [byName] = await db
      .insert(subTopics)
      .values({ moduleId, name: `Photosynthesis basics ${runId}`, sortOrder: 0 })
      .returning();
    subTopicByNameId = byName.id;

    const [byModule] = await db
      .insert(subTopics)
      .values({ moduleId, name: `Unrelated topic name A ${runId}`, sortOrder: 1 })
      .returning();
    subTopicByModuleId = byModule.id;

    const [byQuestion] = await db
      .insert(subTopics)
      .values({ moduleId, name: `Unrelated topic name B ${runId}`, sortOrder: 2 })
      .returning();
    subTopicByQuestionId = byQuestion.id;

    const [byKeyword] = await db
      .insert(subTopics)
      .values({ moduleId, name: `Unrelated topic name C ${runId}`, sortOrder: 3 })
      .returning();
    subTopicByKeywordId = byKeyword.id;

    const [unrelated] = await db
      .insert(subTopics)
      .values({ moduleId, name: `Cash flow basics ${runId}`, sortOrder: 4 })
      .returning();
    subTopicUnrelatedId = unrelated.id;

    const [otherGrade] = await db
      .insert(subTopics)
      .values({ moduleId: otherGradeModule.id, name: `Photosynthesis in Grade 11 ${runId}`, sortOrder: 0 })
      .returning();
    otherGradeSubTopicId = otherGrade.id;

    keywordTag = `Microorganisms ${runId}`;

    await db.insert(mcqs).values([
      {
        subTopicId: subTopicByQuestionId,
        questionText: `What gas is released during photosynthesis? ${runId}`,
        options: ["A", "B"],
        correctOption: 0,
        status: "published",
      },
      {
        subTopicId: subTopicUnrelatedId,
        questionText: `What is a break-even point? ${runId}`,
        options: ["A", "B"],
        correctOption: 0,
        status: "published",
      },
      {
        subTopicId: subTopicByKeywordId,
        questionText: `What do decomposers break down? ${runId}`,
        options: ["A", "B"],
        correctOption: 0,
        status: "published",
        keywords: [keywordTag],
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(subjects).where(eq(subjects.id, subjectId));
  });

  it("matches by sub-topic name (case-insensitive)", async () => {
    const ids = await searchSubTopicIdsByKeyword("10", "PHOTOSYNTHESIS");
    expect(ids.has(subTopicByNameId)).toBe(true);
  });

  it("matches by published question text even when the sub-topic name doesn't mention it", async () => {
    const ids = await searchSubTopicIdsByKeyword("10", "gas");
    expect(ids.has(subTopicByQuestionId)).toBe(true);
    expect(ids.has(subTopicUnrelatedId)).toBe(false);
  });

  it("matches by module name even when neither the sub-topic's own name nor its questions mention the keyword", async () => {
    const ids = await searchSubTopicIdsByKeyword("10", "Unit");
    expect(ids.has(subTopicByModuleId)).toBe(true);
  });

  it("matches by a question's own keywords tag, even when neither the sub-topic name, module name, nor question text mention it", async () => {
    const ids = await searchSubTopicIdsByKeyword("10", keywordTag);
    expect(ids.has(subTopicByKeywordId)).toBe(true);
    expect(ids.has(subTopicUnrelatedId)).toBe(false);
  });

  it("never matches a different grade's sub-topic, even with the same keyword", async () => {
    const ids = await searchSubTopicIdsByKeyword("10", "photosynthesis");
    expect(ids.has(otherGradeSubTopicId)).toBe(false);

    const grade11Ids = await searchSubTopicIdsByKeyword("11", "photosynthesis");
    expect(grade11Ids.has(otherGradeSubTopicId)).toBe(true);
  });

  it("returns an empty set for a blank query, without matching everything", async () => {
    const ids = await searchSubTopicIdsByKeyword("10", "   ");
    expect(ids.size).toBe(0);
  });

  it("returns an empty set when nothing matches", async () => {
    const ids = await searchSubTopicIdsByKeyword("10", "nonexistent-keyword-xyz");
    expect(ids.size).toBe(0);
  });
});

describe("getTopKeywords", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectId: string;
  let tagA: string;
  let tagB: string;
  let tagC: string;
  let tagOtherGrade: string;

  beforeAll(async () => {
    const [subject] = await db
      .insert(subjects)
      .values({ name: `Test TopKeywords Subject ${runId}` })
      .returning();
    subjectId = subject.id;

    const [testModule] = await db
      .insert(modules)
      .values({ subjectId, grade: "10", name: `Test TopKeywords Module ${runId}`, sortOrder: 0 })
      .returning();

    const [otherGradeModule] = await db
      .insert(modules)
      .values({ subjectId, grade: "11", name: `Test TopKeywords Other Grade Module ${runId}`, sortOrder: 0 })
      .returning();

    const [subTopic] = await db
      .insert(subTopics)
      .values({ moduleId: testModule.id, name: `Test TopKeywords Sub-topic ${runId}`, sortOrder: 0 })
      .returning();

    const [otherGradeSubTopic] = await db
      .insert(subTopics)
      .values({ moduleId: otherGradeModule.id, name: `Test TopKeywords Other Grade Sub-topic ${runId}`, sortOrder: 0 })
      .returning();

    tagA = `TagA ${runId}`;
    tagB = `TagB ${runId}`;
    tagC = `TagC ${runId}`;
    tagOtherGrade = `TagOtherGrade ${runId}`;

    await db.insert(mcqs).values([
      // tagA appears on 2 published questions, tagB on 1 -> tagA should rank first.
      { subTopicId: subTopic.id, questionText: "Q1", options: ["A", "B"], correctOption: 0, status: "published", keywords: [tagA] },
      { subTopicId: subTopic.id, questionText: "Q2", options: ["A", "B"], correctOption: 0, status: "published", keywords: [tagA, tagB] },
      // A draft question's keywords must not count toward the frequency.
      { subTopicId: subTopic.id, questionText: "Q3", options: ["A", "B"], correctOption: 0, status: "draft", keywords: [tagC] },
      // A different grade's keyword must never leak into this grade's top list.
      { subTopicId: otherGradeSubTopic.id, questionText: "Q4", options: ["A", "B"], correctOption: 0, status: "published", keywords: [tagOtherGrade] },
    ]);
  });

  afterAll(async () => {
    await db.delete(subjects).where(eq(subjects.id, subjectId));
  });

  it("ranks by frequency, counting only published questions for the requested grade", async () => {
    const top = await getTopKeywords("10", 10);
    const byTag = new Map(top.map((k) => [k.keyword, k.count]));

    expect(byTag.get(tagA)).toBe(2);
    expect(byTag.get(tagB)).toBe(1);
    expect(byTag.has(tagC)).toBe(false); // draft, excluded
    expect(byTag.has(tagOtherGrade)).toBe(false); // different grade, excluded

    const indexA = top.findIndex((k) => k.keyword === tagA);
    const indexB = top.findIndex((k) => k.keyword === tagB);
    expect(indexA).toBeLessThan(indexB);
  });

  it("respects the limit parameter", async () => {
    const top = await getTopKeywords("10", 1);
    expect(top).toHaveLength(1);
    expect(top[0].keyword).toBe(tagA);
  });
});

// A single file-level pool.end(), run once after every describe above has
// finished, rather than inside any one describe's own afterAll — this file
// has two describes that hit the database, and closing the pool inside the
// first one's afterAll would break the second's beforeAll.
afterAll(async () => {
  await pool.end();
});
