import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { mcqs, modules, subjects, subTopics } from "@/db/schema";
import { getSubjectsForAdmin, getTopicsForSubjectGrade } from "@/lib/admin-topics";
import { textOptions } from "./helpers";

describe("getTopicsForSubjectGrade", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectId: string;
  let moduleAId: string;
  let moduleBId: string;
  let subTopicA1Id: string;
  let subTopicA2Id: string;

  beforeAll(async () => {
    const [subject] = await db
      .insert(subjects)
      .values({ name: `Test AdminTopics Subject ${runId}` })
      .returning();
    subjectId = subject.id;

    // Inserted out of sortOrder to confirm the query orders by sort_order,
    // not insertion order.
    const [moduleB] = await db
      .insert(modules)
      .values({ subjectId, grade: "10", name: `Module B ${runId}`, sortOrder: 1 })
      .returning();
    moduleBId = moduleB.id;

    const [moduleA] = await db
      .insert(modules)
      .values({ subjectId, grade: "10", name: `Module A ${runId}`, sortOrder: 0 })
      .returning();
    moduleAId = moduleA.id;

    const [otherGradeModule] = await db
      .insert(modules)
      .values({ subjectId, grade: "11", name: `Other Grade Module ${runId}`, sortOrder: 0 })
      .returning();

    const [subTopicA2] = await db
      .insert(subTopics)
      .values({ moduleId: moduleAId, name: `Sub-topic A2 ${runId}`, sortOrder: 1 })
      .returning();
    subTopicA2Id = subTopicA2.id;

    const [subTopicA1] = await db
      .insert(subTopics)
      .values({ moduleId: moduleAId, name: `Sub-topic A1 ${runId}`, sortOrder: 0 })
      .returning();
    subTopicA1Id = subTopicA1.id;

    await db.insert(subTopics).values({ moduleId: otherGradeModule.id, name: `Other Grade Sub-topic ${runId}`, sortOrder: 0 });

    // Two published questions on A1, one on A2, none on module B's (empty) sub-topics.
    await db.insert(mcqs).values([
      { subTopicId: subTopicA1Id, questionText: "Q1", options: textOptions("A", "B"), correctOption: 0, status: "published" },
      { subTopicId: subTopicA1Id, questionText: "Q2", options: textOptions("A", "B"), correctOption: 0, status: "draft" },
      { subTopicId: subTopicA2Id, questionText: "Q3", options: textOptions("A", "B"), correctOption: 0, status: "published" },
    ]);
  });

  afterAll(async () => {
    await db.delete(subjects).where(eq(subjects.id, subjectId));
  });

  it("orders topics and sub-topics by sort_order, not insertion order", async () => {
    const topics = await getTopicsForSubjectGrade(subjectId, "10");
    expect(topics.map((t) => t.name)).toEqual([`Module A ${runId}`, `Module B ${runId}`]);

    const moduleA = topics.find((t) => t.id === moduleAId)!;
    expect(moduleA.subTopics.map((s) => s.name)).toEqual([`Sub-topic A1 ${runId}`, `Sub-topic A2 ${runId}`]);
  });

  it("counts every mcq (published and draft) tagged with a sub-topic, and sums them at the topic level", async () => {
    const topics = await getTopicsForSubjectGrade(subjectId, "10");
    const moduleA = topics.find((t) => t.id === moduleAId)!;

    const a1 = moduleA.subTopics.find((s) => s.id === subTopicA1Id)!;
    const a2 = moduleA.subTopics.find((s) => s.id === subTopicA2Id)!;
    expect(a1.questionCount).toBe(2); // published + draft both count
    expect(a2.questionCount).toBe(1);
    expect(moduleA.questionCount).toBe(3); // sum across its sub-topics

    const moduleB = topics.find((t) => t.id === moduleBId)!;
    expect(moduleB.questionCount).toBe(0);
  });

  it("never includes a different grade's topics, even for the same subject", async () => {
    const topics = await getTopicsForSubjectGrade(subjectId, "10");
    expect(topics.map((t) => t.name)).not.toContain(`Other Grade Module ${runId}`);

    const grade11Topics = await getTopicsForSubjectGrade(subjectId, "11");
    expect(grade11Topics.map((t) => t.name)).toContain(`Other Grade Module ${runId}`);
  });

  // GCSE represents the combined Grade 10 + Grade 11 syllabus — there's no
  // GCSE-owned taxonomy, so a "gcse" request is a real union of both
  // grades' own modules, not a third independent set.
  it("unions Grade 10 and Grade 11 topics when requested grade is 'gcse', grouped by grade not interleaved", async () => {
    const gcseTopics = await getTopicsForSubjectGrade(subjectId, "gcse");

    expect(gcseTopics.map((t) => t.name)).toEqual([
      `Module A ${runId}`,
      `Module B ${runId}`,
      `Other Grade Module ${runId}`,
    ]);
    // Every Grade 10 module comes before the Grade 11 one — grouped by
    // grade, not an sortOrder-only interleave across two syllabuses.
    const gcseModuleA = gcseTopics.find((t) => t.id === moduleAId)!;
    expect(gcseModuleA.subTopics.map((s) => s.name)).toEqual([`Sub-topic A1 ${runId}`, `Sub-topic A2 ${runId}`]);
  });

  it("returns an empty list for a subject+grade with no topics", async () => {
    const [emptySubject] = await db.insert(subjects).values({ name: `Test Empty Subject ${runId}` }).returning();
    try {
      expect(await getTopicsForSubjectGrade(emptySubject.id, "10")).toEqual([]);
    } finally {
      await db.delete(subjects).where(eq(subjects.id, emptySubject.id));
    }
  });
});

describe("getSubjectsForAdmin", () => {
  it("includes a real subject inserted for this test", async () => {
    const runId = randomUUID().slice(0, 8);
    const [subject] = await db.insert(subjects).values({ name: `Test AdminTopics Subjects List ${runId}` }).returning();
    try {
      const result = await getSubjectsForAdmin();
      expect(result.some((s) => s.id === subject.id && s.name === subject.name)).toBe(true);
    } finally {
      await db.delete(subjects).where(eq(subjects.id, subject.id));
    }
  });

  afterAll(async () => {
    await pool.end();
  });
});
