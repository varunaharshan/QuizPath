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
// every topic in syllabus order rather than only the weak ones or sorted by
// score.
describe("Progress tab: Grade + Subject scoping and KPI math", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectAId: string;
  let subjectBId: string;
  let studentId: string;

  // Subject A, Grade 10: three topics in syllabus order (sortOrder 0/1/2)
  // whose scores are deliberately NOT monotonic with that order, so a test
  // asserting "returned in sortOrder" can't accidentally pass because it
  // also happens to match a score-sorted order.
  let subTopicXId: string; // sortOrder 0, 1/2 correct -> 50% (needs_work)
  let subTopicYId: string; // sortOrder 1, 9/10 correct -> 90% (mastered)
  let subTopicZId: string; // sortOrder 2, 0/3 correct -> 0% (needs_work)
  // Subject A, Grade 11: the student's own profile grade.
  let subTopicA3Id: string; // needs_work, 50%
  // Subject B, Grade 10: must never appear in Subject A's Grade 10 view.
  let subTopicB1Id: string; // needs_work, 0%
  // Subject B, Grade 11: exists but never attempted -> the empty-state case.
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
    const [moduleA11] = await db
      .insert(modules)
      .values({ subjectId: subjectAId, grade: "11", name: `A11 Module ${runId}`, sortOrder: 0 })
      .returning();
    const [moduleB10] = await db
      .insert(modules)
      .values({ subjectId: subjectBId, grade: "10", name: `B10 Module ${runId}`, sortOrder: 0 })
      .returning();
    const [moduleB11] = await db
      .insert(modules)
      .values({ subjectId: subjectBId, grade: "11", name: `B11 Module ${runId}`, sortOrder: 0 })
      .returning();

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

  it("shows progress for the student's own grade (11), scoped to Subject A only", async () => {
    const stats = await getProgressStats(studentId, "11", subjectAId);

    expect(stats.quizzesCompleted).toBe(1);
    expect(stats.totalQuestionsAnswered).toBe(2);
    expect(stats.totalCorrectAnswers).toBe(1);
    expect(stats.averageScore).toBeCloseTo(50, 1);
    expect(stats.topics).toHaveLength(1);
    expect(stats.topics[0].id).toBe(subTopicA3Id);
    expect(stats.topics[0].label).toBe("needs_work");
    expect(stats.topics[0].questionsAnswered).toBe(2);
    expect(stats.topics[0].correctCount).toBe(1);
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

  it("lists every topic for the grade+subject in syllabus order, including the mastered one — not just weak topics, not sorted by score", async () => {
    const stats = await getProgressStats(studentId, "10", subjectAId);

    // All 3 topics present (Y is mastered at 90% — a "weak topics only" view
    // would have dropped it).
    expect(stats.topics.map((t) => t.id)).toEqual([subTopicXId, subTopicYId, subTopicZId]);
    expect(stats.topics.map((t) => t.label)).toEqual(["needs_work", "mastered", "needs_work"]);
  });

  it("never bleeds in topics from a different subject at the same grade", async () => {
    const stats = await getProgressStats(studentId, "10", subjectAId);
    expect(stats.topics.some((t) => t.id === subTopicB1Id)).toBe(false);

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
    // The sub-topic still exists (and is listed as not_started, score null,
    // not 0%) — the empty state is driven by zero attempts, not by zero
    // topics existing.
    expect(stats.topics).toHaveLength(1);
    expect(stats.topics[0].id).toBe(subTopicB2Id);
    expect(stats.topics[0].label).toBe("not_started");
    expect(stats.topics[0].score).toBeNull();
    expect(stats.topics[0].questionsAnswered).toBe(0);
    expect(stats.topics[0].correctCount).toBe(0);
  });
});
