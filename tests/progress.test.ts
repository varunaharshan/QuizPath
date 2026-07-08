import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { mcqs, modules, subjects, subTopics, users } from "@/db/schema";
import { getProgressStats, getSubTopicStatusesForGrade } from "@/lib/dashboard";
import { submitFullSubTopicQuiz, textOptions } from "./helpers";

// Confirms the Progress tab's Grade + Subject scoping and the KPI/topic-table
// math: a student can view progress for their own grade or a different one
// they've practiced (same free-browsing rule as Practice), each grade's
// numbers are never blended with another grade's, topic-level results never
// leak in from a different subject, the KPI cards are cumulative counts (not
// an average of each attempt's own percentage), and the topic table lists
// one row per Topic (module) — never a bare sub-topic as its own top-level
// row — with each topic's own numbers a rollup across its sub-topics, and
// the individual sub-topics available on that row's own `subTopics` array
// for the drill-down.
describe("Progress tab: Grade + Subject scoping and KPI math", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectAId: string;
  let subjectBId: string;
  let studentId: string;

  // Subject A, Grade 10: ONE topic (module) with three sub-topics in
  // syllabus order (sortOrder 0/1/2), whose scores are deliberately NOT
  // monotonic with that order, so a test asserting "returned in sortOrder"
  // can't accidentally pass because it also happens to match a
  // score-sorted order. This is also the fixture that proves the
  // topic-level rollup: three sub-topics' answers must all roll up into
  // exactly one topic row, not three.
  let moduleA10Id: string;
  let subTopicXId: string; // sortOrder 0, 1/2 correct -> 50% (needs_work)
  let subTopicYId: string; // sortOrder 1, 9/10 correct -> 90% (mastered)
  let subTopicZId: string; // sortOrder 2, 0/3 correct -> 0% (needs_work)
  // Subject A, Grade 11: the student's own profile grade — one topic, one sub-topic.
  let moduleA11Id: string;
  let subTopicA3Id: string; // needs_work, 50%
  // Subject B, Grade 10: must never appear in Subject A's Grade 10 view.
  let moduleB10Id: string;
  let subTopicB1Id: string; // needs_work, 0%
  // Subject B, Grade 11: exists but never attempted -> the empty-state case.
  let moduleB11Id: string;
  let subTopicB2Id: string;

  beforeAll(async () => {
    const [subjectA] = await db
      .insert(subjects)
      .values({ name: `Test Progress Subject A ${runId}` })
      .returning();
    subjectAId = subjectA.id;

    const [subjectB] = await db
      .insert(subjects)
      .values({ name: `Test Progress Subject B ${runId}` })
      .returning();
    subjectBId = subjectB.id;

    const [moduleA10] = await db
      .insert(modules)
      .values({ subjectId: subjectAId, grade: "10", name: `A10 Module ${runId}`, sortOrder: 0 })
      .returning();
    moduleA10Id = moduleA10.id;
    const [moduleA11] = await db
      .insert(modules)
      .values({ subjectId: subjectAId, grade: "11", name: `A11 Module ${runId}`, sortOrder: 0 })
      .returning();
    moduleA11Id = moduleA11.id;
    const [moduleB10] = await db
      .insert(modules)
      .values({ subjectId: subjectBId, grade: "10", name: `B10 Module ${runId}`, sortOrder: 0 })
      .returning();
    moduleB10Id = moduleB10.id;
    const [moduleB11] = await db
      .insert(modules)
      .values({ subjectId: subjectBId, grade: "11", name: `B11 Module ${runId}`, sortOrder: 0 })
      .returning();
    moduleB11Id = moduleB11.id;

    const [subTopicX] = await db
      .insert(subTopics)
      .values({ moduleId: moduleA10.id, name: `X Topic ${runId}`, sortOrder: 0 })
      .returning();
    subTopicXId = subTopicX.id;
    const [subTopicY] = await db
      .insert(subTopics)
      .values({ moduleId: moduleA10.id, name: `Y Topic ${runId}`, sortOrder: 1 })
      .returning();
    subTopicYId = subTopicY.id;
    const [subTopicZ] = await db
      .insert(subTopics)
      .values({ moduleId: moduleA10.id, name: `Z Topic ${runId}`, sortOrder: 2 })
      .returning();
    subTopicZId = subTopicZ.id;
    const [subTopicA3] = await db
      .insert(subTopics)
      .values({ moduleId: moduleA11.id, name: `A3 Grade11 Topic ${runId}`, sortOrder: 0 })
      .returning();
    subTopicA3Id = subTopicA3.id;
    const [subTopicB1] = await db
      .insert(subTopics)
      .values({ moduleId: moduleB10.id, name: `B1 Other Subject Topic ${runId}`, sortOrder: 0 })
      .returning();
    subTopicB1Id = subTopicB1.id;
    const [subTopicB2] = await db
      .insert(subTopics)
      .values({ moduleId: moduleB11.id, name: `B2 Untouched Topic ${runId}`, sortOrder: 0 })
      .returning();
    subTopicB2Id = subTopicB2.id;

    async function makeMcqs(subTopicId: string, count: number) {
      const rows = await db
        .insert(mcqs)
        .values(
          Array.from({ length: count }, (_, i) => ({
            subTopicId,
            questionText: `Q${i} for ${subTopicId}`,
            options: textOptions("A", "B"),
            correctOption: 0,
            status: "published" as const,
          })),
        )
        .returning({ id: mcqs.id });
      return rows.map((r) => r.id);
    }

    const xMcqs = await makeMcqs(subTopicXId, 2);
    const yMcqs = await makeMcqs(subTopicYId, 10);
    const zMcqs = await makeMcqs(subTopicZId, 3);
    const a3Mcqs = await makeMcqs(subTopicA3Id, 2);
    const b1Mcqs = await makeMcqs(subTopicB1Id, 1);
    await makeMcqs(subTopicB2Id, 1); // never attempted

    const [student] = await db
      .insert(users)
      .values({ authProviderId: `test-progress-auth-${runId}`, email: `test-progress-${runId}@example.com` })
      .returning();
    studentId = student.id;

    // X: 1 of 2 correct -> 50% (needs_work).
    await submitFullSubTopicQuiz({
      studentId,
      subTopicId: subTopicXId,
      answers: { [xMcqs[0]]: 0, [xMcqs[1]]: 1 },
    });
    // Y: 9 of 10 correct -> 90% (mastered).
    await submitFullSubTopicQuiz({
      studentId,
      subTopicId: subTopicYId,
      answers: Object.fromEntries(yMcqs.map((id, i) => [id, i === 9 ? 1 : 0])),
    });
    // Z: 0 of 3 correct -> 0% (needs_work).
    await submitFullSubTopicQuiz({
      studentId,
      subTopicId: subTopicZId,
      answers: Object.fromEntries(zMcqs.map((id) => [id, 1])),
    });
    // A3 (Grade 11, the student's own profile grade): 1 of 2 -> 50% (needs_work).
    await submitFullSubTopicQuiz({
      studentId,
      subTopicId: subTopicA3Id,
      answers: { [a3Mcqs[0]]: 0, [a3Mcqs[1]]: 1 },
    });
    // B1 (a different subject, same Grade 10): 0 of 1 -> 0% (needs_work).
    // Must never surface in Subject A's Grade 10 progress view.
    await submitFullSubTopicQuiz({
      studentId,
      subTopicId: subTopicB1Id,
      answers: { [b1Mcqs[0]]: 1 },
    });
  });

  afterAll(async () => {
    await db.delete(subjects).where(eq(subjects.id, subjectAId));
    await db.delete(subjects).where(eq(subjects.id, subjectBId));
    await db.delete(users).where(eq(users.id, studentId));
    await pool.end();
  });

  it("shows progress for the student's own grade (11), scoped to Subject A only, with one topic row (not a bare sub-topic row)", async () => {
    const stats = await getProgressStats(studentId, "11", subjectAId);

    expect(stats.quizzesCompleted).toBe(1);
    expect(stats.totalQuestionsAnswered).toBe(2);
    expect(stats.totalCorrectAnswers).toBe(1);
    expect(stats.averageScore).toBeCloseTo(50, 1);
    expect(stats.topics).toHaveLength(1);
    expect(stats.topics[0].id).toBe(moduleA11Id);
    expect(stats.topics[0].label).toBe("needs_work");
    expect(stats.topics[0].questionsAnswered).toBe(2);
    expect(stats.topics[0].correctCount).toBe(1);
    // The drill-down exposes the sub-topic, but it's never itself a
    // top-level row.
    expect(stats.topics[0].subTopics).toHaveLength(1);
    expect(stats.topics[0].subTopics[0].id).toBe(subTopicA3Id);
    expect(stats.topics.map((t) => t.id)).not.toContain(subTopicA3Id);
  });

  it("computes KPI cards as cumulative totals, not an average of each attempt's own percentage", async () => {
    const stats = await getProgressStats(studentId, "10", subjectAId);

    // X: 1/2, Y: 9/10, Z: 0/3 -> cumulative 10 correct of 15 total = 66.67%.
    // A naive per-attempt average of (50 + 90 + 0) / 3 = 46.67% would be wrong
    // — it weights Z's 3-question attempt the same as Y's 10-question one.
    expect(stats.quizzesCompleted).toBe(3);
    expect(stats.totalQuestionsAnswered).toBe(15);
    expect(stats.totalCorrectAnswers).toBe(10);
    expect(stats.averageScore).toBeCloseTo(66.67, 1);
  });

  it("rolls up three sub-topics into exactly one topic row, aggregating without double-counting", async () => {
    const stats = await getProgressStats(studentId, "10", subjectAId);

    // One topic row for the whole grade+subject here, not three — X, Y, Z
    // all belong to the same module.
    expect(stats.topics).toHaveLength(1);
    const topic = stats.topics[0];
    expect(topic.id).toBe(moduleA10Id);

    // The rollup: 15 answered, 10 correct across X+Y+Z combined -> 66.67%,
    // which lands in "in_progress" (60-79), distinct from any individual
    // sub-topic's own label below.
    expect(topic.questionsAnswered).toBe(15);
    expect(topic.correctCount).toBe(10);
    expect(topic.score).toBeCloseTo(66.67, 1);
    expect(topic.label).toBe("in_progress");

    // The drill-down lists every sub-topic in syllabus order (sortOrder),
    // including the mastered one — not sorted by score — each scored on
    // its own, independent of the topic's own rolled-up label.
    expect(topic.subTopics.map((s) => s.id)).toEqual([subTopicXId, subTopicYId, subTopicZId]);
    expect(topic.subTopics.map((s) => s.label)).toEqual(["needs_work", "mastered", "needs_work"]);
    expect(topic.subTopics.map((s) => s.questionsAnswered)).toEqual([2, 10, 3]);
    expect(topic.subTopics.map((s) => s.correctCount)).toEqual([1, 9, 0]);

    // None of the three sub-topics ever appear as their own top-level row.
    expect(stats.topics.map((t) => t.id)).not.toEqual(
      expect.arrayContaining([subTopicXId, subTopicYId, subTopicZId]),
    );
  });

  it("never bleeds in topics (or their sub-topics) from a different subject at the same grade", async () => {
    const stats = await getProgressStats(studentId, "10", subjectAId);
    expect(stats.topics.some((t) => t.id === moduleB10Id)).toBe(false);
    expect(stats.topics.some((t) => t.subTopics.some((s) => s.id === subTopicB1Id))).toBe(false);

    // Confirmed independently via the underlying status query too.
    const statuses = await getSubTopicStatusesForGrade(studentId, "10", subjectAId);
    expect(statuses.some((s) => s.id === subTopicB1Id)).toBe(false);
  });

  it("reports zero attempts for a Grade + Subject the student hasn't touched (empty state), with the untouched topic scored null not 0", async () => {
    const stats = await getProgressStats(studentId, "11", subjectBId);
    expect(stats.quizzesCompleted).toBe(0);
    expect(stats.totalQuestionsAnswered).toBe(0);
    expect(stats.totalCorrectAnswers).toBe(0);
    expect(stats.averageScore).toBeNull();
    // The topic still exists (and is listed as not_started, score null, not
    // 0%) — the empty state is driven by zero attempts, not by zero topics
    // existing.
    expect(stats.topics).toHaveLength(1);
    expect(stats.topics[0].id).toBe(moduleB11Id);
    expect(stats.topics[0].label).toBe("not_started");
    expect(stats.topics[0].score).toBeNull();
    expect(stats.topics[0].questionsAnswered).toBe(0);
    expect(stats.topics[0].correctCount).toBe(0);
    expect(stats.topics[0].subTopics).toHaveLength(1);
    expect(stats.topics[0].subTopics[0].id).toBe(subTopicB2Id);
    expect(stats.topics[0].subTopics[0].score).toBeNull();
  });
});
