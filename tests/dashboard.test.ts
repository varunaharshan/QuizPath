import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { mcqs, modules, papers, subjects, subTopics, users } from "@/db/schema";
import { ensurePaperAttemptStarted, submitQuizAttempt } from "@/lib/quiz";
import { getCompletedQuizzes, getContinueSubTopic } from "@/lib/dashboard";

// Confirms the Dashboard's "continue where you left off" card and "completed
// quizzes" history stay scoped to whichever grade is asked for, even when an
// off-grade attempt exists and is more recent — Practice can browse any
// grade's content, but the Dashboard should only ever reflect the student's
// own curriculum for that grade.
describe("dashboard grade scoping", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectId: string;
  let grade10ModuleId: string;
  let grade11ModuleId: string;
  let grade10SubTopicId: string;
  let grade11SubTopicId: string;
  let grade10McqIds: string[];
  let grade11McqIds: string[];
  let otherGradePaperId: string;
  let studentId: string;

  beforeAll(async () => {
    const [subject] = await db
      .insert(subjects)
      .values({ name: `Test Dashboard Subject ${runId}` })
      .returning();
    subjectId = subject.id;

    const [grade10Module] = await db
      .insert(modules)
      .values({ subjectId, grade: "10", name: `Test Dashboard Module 10 ${runId}`, sortOrder: 0 })
      .returning();
    grade10ModuleId = grade10Module.id;

    const [grade11Module] = await db
      .insert(modules)
      .values({ subjectId, grade: "11", name: `Test Dashboard Module 11 ${runId}`, sortOrder: 0 })
      .returning();
    grade11ModuleId = grade11Module.id;

    const [grade10SubTopic] = await db
      .insert(subTopics)
      .values({ moduleId: grade10ModuleId, name: `Test Dashboard Sub-topic 10 ${runId}`, sortOrder: 0 })
      .returning();
    grade10SubTopicId = grade10SubTopic.id;

    const [grade11SubTopic] = await db
      .insert(subTopics)
      .values({ moduleId: grade11ModuleId, name: `Test Dashboard Sub-topic 11 ${runId}`, sortOrder: 0 })
      .returning();
    grade11SubTopicId = grade11SubTopic.id;

    const grade10Inserted = await db
      .insert(mcqs)
      .values([
        { subTopicId: grade10SubTopicId, questionText: "1 + 1 = ?", options: ["1", "2", "3"], correctOption: 1, status: "published" },
      ])
      .returning({ id: mcqs.id });
    grade10McqIds = grade10Inserted.map((m) => m.id);

    const grade11Inserted = await db
      .insert(mcqs)
      .values([
        { subTopicId: grade11SubTopicId, questionText: "2 + 2 = ?", options: ["3", "4", "5"], correctOption: 1, status: "published" },
      ])
      .returning({ id: mcqs.id });
    grade11McqIds = grade11Inserted.map((m) => m.id);

    const [otherPaper] = await db
      .insert(papers)
      .values({
        subjectId,
        grade: "11",
        medium: "english",
        paperType: "provincial",
        title: `Test Dashboard Off-grade Paper ${runId}`,
        status: "published",
      })
      .returning();
    otherGradePaperId = otherPaper.id;

    await db.insert(mcqs).values([
      { paperId: otherGradePaperId, questionText: "3 + 3 = ?", options: ["5", "6", "7"], correctOption: 1, status: "published" },
    ]);

    const [student] = await db
      .insert(users)
      .values({ authProviderId: `test-dashboard-auth-${runId}`, email: `test-dashboard-${runId}@example.com` })
      .returning();
    studentId = student.id;

    // Complete the Grade 10 attempt first, then the Grade 11 one, so the
    // Grade 11 attempt is the most recent overall — if grade scoping weren't
    // applied, it would incorrectly win the "continue" slot for a Grade 10
    // query and leak into a Grade 10 completed-quizzes list.
    await submitQuizAttempt({
      studentId,
      subTopicId: grade10SubTopicId,
      answers: { [grade10McqIds[0]]: 1 },
    });
    await submitQuizAttempt({
      studentId,
      subTopicId: grade11SubTopicId,
      answers: { [grade11McqIds[0]]: 1 },
    });

    // An in-progress (never completed) off-grade paper attempt — should never
    // surface in either card regardless of which grade is queried: paper
    // attempts aren't reconciled into the continue-card at all, and an
    // incomplete attempt is never "completed."
    await ensurePaperAttemptStarted(studentId, otherGradePaperId);
  });

  afterAll(async () => {
    await db.delete(subjects).where(eq(subjects.id, subjectId));
    await db.delete(users).where(eq(users.id, studentId));
    await pool.end();
  });

  it("getContinueSubTopic only returns an attempt matching the requested grade", async () => {
    const grade10Continue = await getContinueSubTopic(studentId, "10");
    expect(grade10Continue?.subTopicId).toBe(grade10SubTopicId);

    const grade11Continue = await getContinueSubTopic(studentId, "11");
    expect(grade11Continue?.subTopicId).toBe(grade11SubTopicId);
  });

  it("getCompletedQuizzes excludes the off-grade completed attempt and the off-grade in-progress paper", async () => {
    const grade10Completed = await getCompletedQuizzes(studentId, { grade: "10" });
    expect(grade10Completed.map((q) => q.title)).toContain(`Test Dashboard Sub-topic 10 ${runId}`);
    expect(grade10Completed.map((q) => q.title)).not.toContain(`Test Dashboard Sub-topic 11 ${runId}`);
    expect(grade10Completed.map((q) => q.title)).not.toContain(`Test Dashboard Off-grade Paper ${runId}`);

    const grade11Completed = await getCompletedQuizzes(studentId, { grade: "11" });
    expect(grade11Completed.map((q) => q.title)).toContain(`Test Dashboard Sub-topic 11 ${runId}`);
    expect(grade11Completed.map((q) => q.title)).not.toContain(`Test Dashboard Sub-topic 10 ${runId}`);
    // The paper attempt is still in-progress (never completed), so it must
    // not appear even under its own grade.
    expect(grade11Completed.map((q) => q.title)).not.toContain(`Test Dashboard Off-grade Paper ${runId}`);
  });

  it("an unfiltered call (no grade) still returns every completed attempt, for the Active learner flag", async () => {
    const all = await getCompletedQuizzes(studentId);
    const titles = all.map((q) => q.title);
    expect(titles).toContain(`Test Dashboard Sub-topic 10 ${runId}`);
    expect(titles).toContain(`Test Dashboard Sub-topic 11 ${runId}`);
  });
});
