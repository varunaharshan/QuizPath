import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { mcqs, modules, subjects, subTopics, users } from "@/db/schema";
import { getWeakTopicsForGrade } from "@/lib/dashboard";
import { submitFullSubTopicQuiz, textOptions } from "./helpers";

// Confirms the Weak Areas page's sub-topic-driven inclusion rule: a topic
// appears if and only if at least one of its sub-topics is individually
// needs_work (score < 60%) — the topic's own rolled-up aggregate is
// irrelevant to inclusion, so a topic can appear here even while sitting
// well above 60% overall (dragged down by one weak pocket). The drill-down
// (`subTopics`) is filtered to only that weak slice — strong sub-topics and
// never-attempted ones are both omitted — while the topic row's own
// questionsAnswered/correctCount/score/label still reflect its TRUE full
// aggregate across every sub-topic, hidden ones included.
describe("getWeakTopicsForGrade", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectAId: string;
  let subjectBId: string;
  let studentId: string;

  // Subject A, Grade 10: a topic that's mostly strong (83.33% true
  // aggregate — well above 60%) but has one individually-weak sub-topic
  // (X, 50%) alongside a strong one (Y, 90%) and a never-attempted one (Z).
  // This is the exact "topic at ~85% should still show up" scenario.
  let moduleWeakId: string;
  let subXId: string; // sortOrder 0, 1/2 correct -> 50% (weak, shown)
  let subYId: string; // sortOrder 1, 9/10 correct -> 90% (strong, hidden)
  let subZId: string; // sortOrder 2, never attempted (hidden)

  // Subject A, Grade 10: attempted and imperfect (73.33%), but every
  // individual sub-topic is itself >= 60% — must be excluded entirely,
  // since no sub-topic is actually weak. Q lands exactly on the 60%
  // boundary to confirm "below 60%" is strict, not inclusive.
  let moduleOkId: string;

  // Subject A, Grade 10: nobody has touched it — must never appear.
  let moduleUntouchedId: string;

  // Subject B, Grade 10: a second weak topic, with a lower true aggregate
  // (25%) than moduleWeakId's 83.33% — proves sorting uses the topic's own
  // true aggregate (not e.g. the weak sub-topic's own score) and that the
  // function spans every subject for the grade, not just one.
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
    const yMcqs = await makeMcqs(subYId, 10);
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
    // Y: 9/10 -> 90% (mastered).
    await submitFullSubTopicQuiz({
      studentId,
      subTopicId: subYId,
      answers: Object.fromEntries(yMcqs.map((id, i) => [id, i === 9 ? 1 : 0])),
    });
    // P: 8/10 -> 80% (mastered).
    await submitFullSubTopicQuiz({
      studentId,
      subTopicId: subP.id,
      answers: Object.fromEntries(pMcqs.map((id, i) => [id, i < 8 ? 0 : 1])),
    });
    // Q: 3/5 -> exactly 60% (in_progress — the boundary, not needs_work).
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

  it("includes a topic whose true aggregate is well above 60% because one sub-topic is individually weak", async () => {
    const weak = await getWeakTopicsForGrade(studentId, "10");
    const weakTopic = weak.find((t) => t.id === moduleWeakId);
    expect(weakTopic).toBeDefined();
    // (1 + 9) / (2 + 10) = 83.33% -> "mastered" at the topic level, yet it
    // still appears because X alone is needs_work.
    expect(weakTopic!.score).toBeCloseTo(83.33, 1);
    expect(weakTopic!.label).toBe("mastered");
  });

  it("excludes a topic where every sub-topic scores >= 60%, even though it's attempted and imperfect overall", async () => {
    const weak = await getWeakTopicsForGrade(studentId, "10");
    expect(weak.some((t) => t.id === moduleOkId)).toBe(false);
  });

  it("excludes an untouched topic and a different grade's topic", async () => {
    const weak = await getWeakTopicsForGrade(studentId, "10");
    expect(weak.some((t) => t.id === moduleUntouchedId)).toBe(false);
    expect(weak.some((t) => t.id === moduleGrade11WeakId)).toBe(false);
  });

  it("filters the drill-down to only the weak sub-topic(s), omitting the strong one and the never-attempted one", async () => {
    const weak = await getWeakTopicsForGrade(studentId, "10");
    const weakTopic = weak.find((t) => t.id === moduleWeakId)!;

    expect(weakTopic.subTopics.map((s) => s.id)).toEqual([subXId]);
    expect(weakTopic.subTopics.some((s) => s.id === subYId)).toBe(false);
    expect(weakTopic.subTopics.some((s) => s.id === subZId)).toBe(false);
  });

  it("keeps the topic row's own numbers as the true full aggregate, not just the weak slice shown", async () => {
    const weak = await getWeakTopicsForGrade(studentId, "10");
    const weakTopic = weak.find((t) => t.id === moduleWeakId)!;

    // Includes Y's (hidden) 9/10 and Z's (hidden) 0/0, not just X's 1/2.
    expect(weakTopic.questionsAnswered).toBe(12);
    expect(weakTopic.correctCount).toBe(10);
  });

  it("spans every subject for the grade and sorts by the topic's true aggregate score, ascending", async () => {
    const weak = await getWeakTopicsForGrade(studentId, "10");

    const otherWeakTopic = weak.find((t) => t.id === moduleOtherWeakId);
    expect(otherWeakTopic).toBeDefined();
    expect(otherWeakTopic!.score).toBeCloseTo(25, 1);

    // Other Weak Module (25% true aggregate) sorts before Weak Module
    // (83.33% true aggregate), even though Weak Module's own weak
    // sub-topic (50%) scores worse than Other Weak Module's (25%) — proving
    // sort order follows the topic's true aggregate, not the weak
    // sub-topic's own score.
    const otherWeakIndex = weak.findIndex((t) => t.id === moduleOtherWeakId);
    const weakIndex = weak.findIndex((t) => t.id === moduleWeakId);
    expect(otherWeakIndex).toBeLessThan(weakIndex);
  });

  it("returns an empty list for a student with no weak sub-topics anywhere", async () => {
    const weak = await getWeakTopicsForGrade(randomUUID(), "10");
    expect(weak).toEqual([]);
  });
});
