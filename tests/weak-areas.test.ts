import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { mcqs, modules, subjects, subTopics, users } from "@/db/schema";
import { getWeakTopicsForGrade } from "@/lib/dashboard";
import { submitFullSubTopicQuiz, textOptions } from "./helpers";

// Confirms the Weak Areas page's topic-primary rollup: one row per Topic
// (module) the student has actually attempted AND that's itself needs_work
// (score < 60%) — never a bare sub-topic row, never a topic that's merely
// "the least good among attempted" but still scoring fine, and never an
// untouched topic. Grade-wide across every subject (not scoped to one), and
// sorted weakest-first.
describe("getWeakTopicsForGrade", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectAId: string;
  let subjectBId: string;
  let studentId: string;

  // Subject A, Grade 10: a genuinely weak topic — two attempted sub-topics
  // (both needs_work) plus one never-attempted sub-topic under the same
  // module, rolling up to 1/5 = 20% overall.
  let moduleWeakId: string;
  let subXId: string; // sortOrder 0, 1/2 correct -> 50% (needs_work)
  let subYId: string; // sortOrder 1, 0/3 correct -> 0% (needs_work)
  let subZId: string; // sortOrder 2, never attempted (not_started)

  // Subject A, Grade 10: a topic that's attempted and imperfect, but not
  // actually needs_work at the rolled-up level (73.33%) — must be excluded
  // even though, absent a real threshold, it could look like "the weakest
  // topic that has any imperfection."
  let moduleOkId: string;

  // Subject A, Grade 10: attempted by nobody — must never appear (that's
  // what By Topic is for).
  let moduleUntouchedId: string;

  // Subject B, Grade 10: a second weak topic in a different subject,
  // scoring worse than moduleWeakId (25% vs 20%)... actually scoring
  // BETTER (25% > 20%) so it must sort after moduleWeakId — proves this
  // function is grade-wide (spans subjects) and genuinely sorts by score,
  // not by subject or insertion order.
  let moduleOtherWeakId: string;

  // Subject A, Grade 11: the student's own profile grade — must never
  // appear when querying Grade 10.
  let moduleGrade11WeakId: string;

  beforeAll(async () => {
    const [subjectA] = await db.insert(subjects).values({ name: `Test WeakAreas Subject A ${runId}` }).returning();
    subjectAId = subjectA.id;
    const [subjectB] = await db.insert(subjects).values({ name: `Test WeakAreas Subject B ${runId}` }).returning();
    subjectBId = subjectB.id;

    const [moduleWeak] = await db
      .insert(modules)
      .values({ subjectId: subjectAId, grade: "10", name: `Weak Module ${runId}`, sortOrder: 0 })
      .returning();
    moduleWeakId = moduleWeak.id;
    const [moduleOk] = await db
      .insert(modules)
      .values({ subjectId: subjectAId, grade: "10", name: `OK Module ${runId}`, sortOrder: 1 })
      .returning();
    moduleOkId = moduleOk.id;
    const [moduleUntouched] = await db
      .insert(modules)
      .values({ subjectId: subjectAId, grade: "10", name: `Untouched Module ${runId}`, sortOrder: 2 })
      .returning();
    moduleUntouchedId = moduleUntouched.id;
    const [moduleOtherWeak] = await db
      .insert(modules)
      .values({ subjectId: subjectBId, grade: "10", name: `Other Weak Module ${runId}`, sortOrder: 0 })
      .returning();
    moduleOtherWeakId = moduleOtherWeak.id;
    const [moduleGrade11Weak] = await db
      .insert(modules)
      .values({ subjectId: subjectAId, grade: "11", name: `Grade11 Weak Module ${runId}`, sortOrder: 0 })
      .returning();
    moduleGrade11WeakId = moduleGrade11Weak.id;

    const [subX] = await db.insert(subTopics).values({ moduleId: moduleWeakId, name: `X ${runId}`, sortOrder: 0 }).returning();
    subXId = subX.id;
    const [subY] = await db.insert(subTopics).values({ moduleId: moduleWeakId, name: `Y ${runId}`, sortOrder: 1 }).returning();
    subYId = subY.id;
    const [subZ] = await db.insert(subTopics).values({ moduleId: moduleWeakId, name: `Z ${runId}`, sortOrder: 2 }).returning();
    subZId = subZ.id;
    const [subP] = await db.insert(subTopics).values({ moduleId: moduleOkId, name: `P ${runId}`, sortOrder: 0 }).returning();
    const [subQ] = await db.insert(subTopics).values({ moduleId: moduleOkId, name: `Q ${runId}`, sortOrder: 1 }).returning();
    await db.insert(subTopics).values({ moduleId: moduleUntouchedId, name: `Untouched ${runId}`, sortOrder: 0 });
    const [subR] = await db
      .insert(subTopics)
      .values({ moduleId: moduleOtherWeakId, name: `R ${runId}`, sortOrder: 0 })
      .returning();
    const [subG11] = await db
      .insert(subTopics)
      .values({ moduleId: moduleGrade11WeakId, name: `G11 ${runId}`, sortOrder: 0 })
      .returning();

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

    const xMcqs = await makeMcqs(subXId, 2);
    const yMcqs = await makeMcqs(subYId, 3);
    await makeMcqs(subZId, 1); // exists, but never attempted
    const pMcqs = await makeMcqs(subP.id, 10);
    const qMcqs = await makeMcqs(subQ.id, 5);
    const rMcqs = await makeMcqs(subR.id, 4);
    const g11Mcqs = await makeMcqs(subG11.id, 2);

    const [student] = await db
      .insert(users)
      .values({ authProviderId: `test-weak-areas-auth-${runId}`, email: `test-weak-areas-${runId}@example.com` })
      .returning();
    studentId = student.id;

    // X: 1/2 -> 50% (needs_work).
    await submitFullSubTopicQuiz({ studentId, subTopicId: subXId, answers: { [xMcqs[0]]: 0, [xMcqs[1]]: 1 } });
    // Y: 0/3 -> 0% (needs_work).
    await submitFullSubTopicQuiz({
      studentId,
      subTopicId: subYId,
      answers: Object.fromEntries(yMcqs.map((id) => [id, 1])),
    });
    // P: 8/10 -> 80% (mastered).
    await submitFullSubTopicQuiz({
      studentId,
      subTopicId: subP.id,
      answers: Object.fromEntries(pMcqs.map((id, i) => [id, i < 8 ? 0 : 1])),
    });
    // Q: 3/5 -> 60% (in_progress).
    await submitFullSubTopicQuiz({
      studentId,
      subTopicId: subQ.id,
      answers: Object.fromEntries(qMcqs.map((id, i) => [id, i < 3 ? 0 : 1])),
    });
    // R (Subject B): 1/4 -> 25% (needs_work).
    await submitFullSubTopicQuiz({
      studentId,
      subTopicId: subR.id,
      answers: Object.fromEntries(rMcqs.map((id, i) => [id, i === 0 ? 0 : 1])),
    });
    // G11 (Grade 11): 0/2 -> 0% (needs_work) — must not appear in Grade 10 results.
    await submitFullSubTopicQuiz({
      studentId,
      subTopicId: subG11.id,
      answers: Object.fromEntries(g11Mcqs.map((id) => [id, 1])),
    });
  });

  afterAll(async () => {
    await db.delete(subjects).where(eq(subjects.id, subjectAId));
    await db.delete(subjects).where(eq(subjects.id, subjectBId));
    await db.delete(users).where(eq(users.id, studentId));
    await pool.end();
  });

  it("includes only attempted topics that are themselves needs_work, excluding an untouched topic and a merely-imperfect one", async () => {
    const weak = await getWeakTopicsForGrade(studentId, "10");
    const ids = weak.map((t) => t.id);

    expect(ids).toContain(moduleWeakId);
    expect(ids).toContain(moduleOtherWeakId);
    expect(ids).not.toContain(moduleOkId); // 73.33% — attempted, imperfect, but not needs_work
    expect(ids).not.toContain(moduleUntouchedId); // zero attempts
    expect(ids).not.toContain(moduleGrade11WeakId); // wrong grade
  });

  it("rolls up a topic's sub-topics without double-counting, including an unattempted sub-topic under it", async () => {
    const weak = await getWeakTopicsForGrade(studentId, "10");
    const weakTopic = weak.find((t) => t.id === moduleWeakId)!;

    // X (1/2) + Y (0/3) = 1/5 correct -> 20%, needs_work.
    expect(weakTopic.questionsAnswered).toBe(5);
    expect(weakTopic.correctCount).toBe(1);
    expect(weakTopic.score).toBeCloseTo(20, 1);
    expect(weakTopic.label).toBe("needs_work");

    // The drill-down lists all three sub-topics in syllabus order, including
    // Z (never attempted, not_started) — not filtered out just because it
    // has no data of its own.
    expect(weakTopic.subTopics.map((s) => s.id)).toEqual([subXId, subYId, subZId]);
    expect(weakTopic.subTopics.map((s) => s.label)).toEqual(["needs_work", "needs_work", "not_started"]);
    expect(weakTopic.subTopics.find((s) => s.id === subZId)?.score).toBeNull();
    expect(weakTopic.subTopics.find((s) => s.id === subZId)?.questionsAnswered).toBe(0);
  });

  it("counts only the needs_work sub-topics toward the weak badge, out of every sub-topic in the topic", async () => {
    const weak = await getWeakTopicsForGrade(studentId, "10");
    const weakTopic = weak.find((t) => t.id === moduleWeakId)!;

    // X and Y are needs_work; Z is not_started (not counted as "weak").
    expect(weakTopic.weakSubTopicCount).toBe(2);
    expect(weakTopic.totalSubTopicCount).toBe(3);
  });

  it("spans every subject for the grade (not scoped to one) and sorts ascending by score", async () => {
    const weak = await getWeakTopicsForGrade(studentId, "10");

    // Weak Module (Subject A, 20%) must sort before Other Weak Module
    // (Subject B, 25%) — proves both subjects are included in one list,
    // genuinely sorted by score rather than grouped by subject.
    const weakIndex = weak.findIndex((t) => t.id === moduleWeakId);
    const otherWeakIndex = weak.findIndex((t) => t.id === moduleOtherWeakId);
    expect(weakIndex).toBeGreaterThanOrEqual(0);
    expect(otherWeakIndex).toBeGreaterThan(weakIndex);

    const otherWeakTopic = weak.find((t) => t.id === moduleOtherWeakId)!;
    expect(otherWeakTopic.score).toBeCloseTo(25, 1);
  });

  it("returns an empty list for a grade with no weak topics", async () => {
    // A grade nobody has touched at all for this student.
    const weak = await getWeakTopicsForGrade(randomUUID(), "10");
    expect(weak).toEqual([]);
  });
});
