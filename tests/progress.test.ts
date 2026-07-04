import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { mcqs, modules, subjects, subTopics, users } from "@/db/schema";
import { submitQuizAttempt } from "@/lib/quiz";
import { getProgressStats, getSubTopicStatusesForGrade } from "@/lib/dashboard";

// Confirms the Progress tab's Grade + Subject scoping: a student can view
// progress for their own grade or a different one they've practiced (same
// free-browsing rule as Practice), each grade's numbers are never blended
// with another grade's, and topic-level results never leak in from a
// different subject either.
describe("Progress tab: Grade + Subject scoping", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectAId: string;
  let subjectBId: string;
  let studentId: string;

  // Subject A, Grade 10: one weak topic, one mastered topic.
  let subTopicA1Id: string; // needs_work, 50%
  let subTopicA2Id: string; // mastered, 100%
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

    const [subTopicA1] = await db
      .insert(subTopics)
      .values({ moduleId: moduleA10.id, name: `A1 Weak Topic ${runId}`, sortOrder: 0 })
      .returning();
    subTopicA1Id = subTopicA1.id;
    const [subTopicA2] = await db
      .insert(subTopics)
      .values({ moduleId: moduleA10.id, name: `A2 Mastered Topic ${runId}`, sortOrder: 1 })
      .returning();
    subTopicA2Id = subTopicA2.id;
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
            options: ["A", "B"],
            correctOption: 0,
            status: "published" as const,
          })),
        )
        .returning({ id: mcqs.id });
      return rows.map((r) => r.id);
    }

    const a1Mcqs = await makeMcqs(subTopicA1Id, 2);
    const a2Mcqs = await makeMcqs(subTopicA2Id, 2);
    const a3Mcqs = await makeMcqs(subTopicA3Id, 2);
    const b1Mcqs = await makeMcqs(subTopicB1Id, 1);
    await makeMcqs(subTopicB2Id, 1); // never attempted

    const [student] = await db
      .insert(users)
      .values({ authProviderId: `test-progress-auth-${runId}`, email: `test-progress-${runId}@example.com` })
      .returning();
    studentId = student.id;

    // A1: 1 of 2 correct -> 50% (needs_work).
    await submitQuizAttempt({
      studentId,
      subTopicId: subTopicA1Id,
      answers: { [a1Mcqs[0]]: 0, [a1Mcqs[1]]: 1 },
    });
    // A2: 2 of 2 correct -> 100% (mastered).
    await submitQuizAttempt({
      studentId,
      subTopicId: subTopicA2Id,
      answers: { [a2Mcqs[0]]: 0, [a2Mcqs[1]]: 0 },
    });
    // A3 (Grade 11, the student's own profile grade): 1 of 2 -> 50% (needs_work).
    await submitQuizAttempt({
      studentId,
      subTopicId: subTopicA3Id,
      answers: { [a3Mcqs[0]]: 0, [a3Mcqs[1]]: 1 },
    });
    // B1 (a different subject, same Grade 10): 0 of 1 -> 0% (needs_work).
    // Must never surface in Subject A's Grade 10 progress view.
    await submitQuizAttempt({
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
    expect(stats.averageScore).toBeCloseTo(50, 1);
    expect(stats.masteredCount).toBe(0);
    expect(stats.totalSubTopics).toBe(1);
    expect(stats.subTopicBars).toHaveLength(1);
    expect(stats.subTopicBars[0].id).toBe(subTopicA3Id);
    expect(stats.subTopicBars[0].label).toBe("needs_work");
    expect(stats.subTopicBars[0].questionsAnswered).toBe(2);
  });

  it("shows progress for a different grade (10) the student has practiced, mirroring Practice's cross-grade browsing", async () => {
    const stats = await getProgressStats(studentId, "10", subjectAId);

    expect(stats.quizzesCompleted).toBe(2);
    expect(stats.averageScore).toBeCloseTo(75, 1); // (50 + 100) / 2
    expect(stats.masteredCount).toBe(1);
    expect(stats.totalSubTopics).toBe(2);

    const barIds = stats.subTopicBars.map((b) => b.id).sort();
    expect(barIds).toEqual([subTopicA1Id, subTopicA2Id].sort());
  });

  it("never bleeds in topics from a different subject at the same grade", async () => {
    const stats = await getProgressStats(studentId, "10", subjectAId);
    expect(stats.subTopicBars.some((b) => b.id === subTopicB1Id)).toBe(false);

    // Confirmed independently via the underlying status query too.
    const statuses = await getSubTopicStatusesForGrade(studentId, "10", subjectAId);
    expect(statuses.some((s) => s.id === subTopicB1Id)).toBe(false);
  });

  it("weak-topics (needs_work) list reflects only the selected Grade + Subject", async () => {
    const grade10SubjectA = await getProgressStats(studentId, "10", subjectAId);
    const weakGrade10SubjectA = grade10SubjectA.subTopicBars.filter((b) => b.label === "needs_work");
    expect(weakGrade10SubjectA.map((b) => b.id)).toEqual([subTopicA1Id]);

    const grade11SubjectA = await getProgressStats(studentId, "11", subjectAId);
    const weakGrade11SubjectA = grade11SubjectA.subTopicBars.filter((b) => b.label === "needs_work");
    expect(weakGrade11SubjectA.map((b) => b.id)).toEqual([subTopicA3Id]);
  });

  it("reports zero attempts for a Grade + Subject the student hasn't touched (empty state)", async () => {
    const stats = await getProgressStats(studentId, "11", subjectBId);
    expect(stats.quizzesCompleted).toBe(0);
    expect(stats.averageScore).toBeNull();
    // The sub-topic still exists (and is listed as not_started) — the empty
    // state is driven by zero attempts, not by zero topics existing.
    expect(stats.totalSubTopics).toBe(1);
    expect(stats.subTopicBars[0].id).toBe(subTopicB2Id);
    expect(stats.subTopicBars[0].label).toBe("not_started");
  });
});
