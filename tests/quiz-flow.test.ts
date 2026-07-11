import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import {
  masteryScores,
  mcqs,
  modules,
  quizAttemptAnswers,
  quizAttempts,
  subjects,
  subTopics,
  users,
} from "@/db/schema";
import {
  ensureSubTopicAttemptStarted,
  finalizeSubTopicAttempt,
  getExistingAnswers,
  getQuizForSubTopic,
  saveQuizAnswer,
} from "@/lib/quiz";
import { getSubTopicStatusesForGrade } from "@/lib/dashboard";
import { submitFullSubTopicQuiz, textOptions } from "./helpers";

describe("quiz-taking flow", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectId: string;
  let moduleId: string;
  let subTopicId: string;
  let studentId: string;
  let mcqIds: string[];
  let draftMcqId: string;

  beforeAll(async () => {
    const [subject] = await db
      .insert(subjects)
      .values({ name: `Test Subject ${runId}` })
      .returning();
    subjectId = subject.id;

    const [testModule] = await db
      .insert(modules)
      .values({ subjectId, grade: "10", name: `Test Module ${runId}`, sortOrder: 0 })
      .returning();
    moduleId = testModule.id;

    const [subTopic] = await db
      .insert(subTopics)
      .values({ moduleId, name: `Test Sub-topic ${runId}`, sortOrder: 0 })
      .returning();
    subTopicId = subTopic.id;

    const inserted = await db
      .insert(mcqs)
      .values([
        {
          subTopicId,
          questionText: "2 + 2 = ?",
          options: textOptions("3", "4", "5", "6"),
          correctOption: 1,
          status: "published",
          hint: "Count on your fingers",
        },
        {
          subTopicId,
          questionText: "The chemical symbol for water is:",
          options: textOptions("O2", "H2O", "CO2", "NaCl"),
          correctOption: 1,
          status: "published",
        },
        {
          subTopicId,
          questionText: "The sun rises in the:",
          options: textOptions("West", "North", "East", "South"),
          correctOption: 2,
          status: "published",
        },
        {
          subTopicId,
          questionText: "Draft question that should never be served",
          options: textOptions("A", "B"),
          correctOption: 0,
          status: "draft",
        },
      ])
      .returning({ id: mcqs.id, status: mcqs.status });

    mcqIds = inserted.filter((m) => m.status === "published").map((m) => m.id);
    draftMcqId = inserted.find((m) => m.status === "draft")!.id;

    const [student] = await db
      .insert(users)
      .values({ authProviderId: `test-auth-${runId}`, email: `test-${runId}@example.com` })
      .returning();
    studentId = student.id;
  });

  afterAll(async () => {
    // Deleting the sub-topic cascades mcqs, quiz_attempts (-> quiz_attempt_answers),
    // and mastery_scores; deleting the user cascades any of theirs too.
    await db.delete(subTopics).where(eq(subTopics.id, subTopicId));
    await db.delete(modules).where(eq(modules.id, moduleId));
    await db.delete(subjects).where(eq(subjects.id, subjectId));
    await db.delete(users).where(eq(users.id, studentId));
  });

  it("lists the sub-topic under the student's grade (select sub-topic step)", async () => {
    const statuses = await getSubTopicStatusesForGrade(studentId, "10");
    const testStatus = statuses.find((s) => s.id === subTopicId);
    expect(testStatus).toBeDefined();
    expect(testStatus!.moduleName).toBe(`Test Module ${runId}`);
    expect(testStatus!.label).toBe("not_started");
  });

  it("serves only published MCQs, without leaking the answer key (quiz-serving step)", async () => {
    const quiz = await getQuizForSubTopic(subTopicId);
    expect(quiz.subTopic?.id).toBe(subTopicId);
    expect(quiz.questions).toHaveLength(3);
    expect(quiz.questions.map((q) => q.id).sort()).toEqual([...mcqIds].sort());
    expect(quiz.questions.some((q) => q.id === draftMcqId)).toBe(false);
    for (const q of quiz.questions) {
      expect(q).not.toHaveProperty("correctOption");
      // Every question in a sub-topic quiz carries that same sub-topic's
      // name as its topic tag.
      expect(q.subTopicName).toBe(`Test Sub-topic ${runId}`);
    }

    // One fixture question has a hint, the rest don't — confirms hint rides
    // along on the served quiz without affecting scoring, and that "no
    // hint" comes through as null rather than an empty string.
    const withHint = quiz.questions.find((q) => q.questionText === "2 + 2 = ?");
    expect(withHint?.hint).toBe("Count on your fingers");
    const withoutHint = quiz.questions.find((q) => q.questionText === "The sun rises in the:");
    expect(withoutHint?.hint).toBeNull();
  });

  it("grades an attempt, persists it, and sets mastery to 'in_progress' for a 2/3 score", async () => {
    const [q1, q2, q3] = mcqIds;
    const result = await submitFullSubTopicQuiz({
      studentId,
      subTopicId,
      answers: { [q1]: 1, [q2]: 1, [q3]: 0 }, // 2 correct, 1 wrong -> 66.67%
    });

    expect(result.questionsAnswered).toBe(3);
    expect(result.totalQuestions).toBe(3);
    expect(result.correctCount).toBe(2);
    expect(result.score).toBeCloseTo(66.67, 1);
    expect(result.masteryLabel).toBe("in_progress");

    const attempt = await db.query.quizAttempts.findFirst({
      where: eq(quizAttempts.id, result.attemptId),
    });
    expect(attempt).toBeDefined();
    expect(attempt!.studentId).toBe(studentId);
    expect(attempt!.subTopicId).toBe(subTopicId);
    expect(attempt!.completedAt).not.toBeNull();
    expect(Number(attempt!.score)).toBeCloseTo(66.67, 1);

    const answers = await db
      .select()
      .from(quizAttemptAnswers)
      .where(eq(quizAttemptAnswers.quizAttemptId, result.attemptId));
    expect(answers).toHaveLength(3);
    const correctCount = answers.filter((a) => a.isCorrect).length;
    expect(correctCount).toBe(2);

    const mastery = await db.query.masteryScores.findFirst({
      where: eq(masteryScores.subTopicId, subTopicId),
    });
    expect(mastery).toBeDefined();
    expect(mastery!.studentId).toBe(studentId);
    expect(Number(mastery!.score)).toBeCloseTo(66.67, 1);
    expect(mastery!.questionsAnswered).toBe(3);
  });

  it("combines a later 3/3 attempt into the running cumulative mastery (not an overwrite)", async () => {
    const [q1, q2, q3] = mcqIds;
    const result = await submitFullSubTopicQuiz({
      studentId,
      subTopicId,
      answers: { [q1]: 1, [q2]: 1, [q3]: 2 }, // all correct -> 100% for this attempt
    });

    // This attempt's own score is a clean 100%...
    expect(result.score).toBe(100);
    expect(result.masteryLabel).toBe("mastered");

    // ...but cumulative mastery combines it with the earlier 2/3 attempt:
    // 5 correct of 6 total answered, not just this attempt's 100%.
    const masteryRows = await db
      .select()
      .from(masteryScores)
      .where(eq(masteryScores.subTopicId, subTopicId));
    expect(masteryRows).toHaveLength(1);
    expect(masteryRows[0].questionsAnswered).toBe(6);
    expect(Number(masteryRows[0].score)).toBeCloseTo(83.33, 1);

    const allAttempts = await db
      .select()
      .from(quizAttempts)
      .where(eq(quizAttempts.subTopicId, subTopicId));
    expect(allAttempts).toHaveLength(2);
  });

  it("blocks finalizing an attempt with zero saved answers (no divide-by-zero)", async () => {
    const attemptId = await ensureSubTopicAttemptStarted(studentId, subTopicId);
    await expect(finalizeSubTopicAttempt({ studentId, attemptId })).rejects.toThrow();

    const attempt = await db.query.quizAttempts.findFirst({ where: eq(quizAttempts.id, attemptId) });
    expect(attempt!.completedAt).toBeNull();
  });

  it("finalizes successfully with exactly 1 answered question, scoring only against what was answered", async () => {
    const [q1] = mcqIds; // correctOption is 1 for q1
    const attemptId = await ensureSubTopicAttemptStarted(studentId, subTopicId);
    await saveQuizAnswer({ studentId, attemptId, mcqId: q1, selectedOption: 1 });

    const result = await finalizeSubTopicAttempt({ studentId, attemptId });
    expect(result.questionsAnswered).toBe(1);
    expect(result.totalQuestions).toBe(3);
    expect(result.correctCount).toBe(1);
    expect(result.score).toBe(100);
  });

  it("resumes an in-progress attempt with prior answers intact after navigating away without submitting", async () => {
    const [q1, q2] = mcqIds;
    const attemptId = await ensureSubTopicAttemptStarted(studentId, subTopicId);
    await saveQuizAnswer({ studentId, attemptId, mcqId: q1, selectedOption: 1 });

    // Simulates leaving without submitting, then coming back via Practice:
    // the same in-progress attempt is reused, and its answer is still there.
    const resumedAttemptId = await ensureSubTopicAttemptStarted(studentId, subTopicId);
    expect(resumedAttemptId).toBe(attemptId);

    const existingAnswers = await getExistingAnswers(resumedAttemptId);
    expect(existingAnswers[q1]).toBe(1);

    // Answering a second question incrementally saves it too, without
    // disturbing the first.
    await saveQuizAnswer({ studentId, attemptId: resumedAttemptId, mcqId: q2, selectedOption: 1 });
    const updatedAnswers = await getExistingAnswers(resumedAttemptId);
    expect(updatedAnswers[q1]).toBe(1);
    expect(updatedAnswers[q2]).toBe(1);

    // Explicitly submitting (partial — only 2 of 3 answered) completes the
    // attempt, so a subsequent "resume" call must start a fresh attempt
    // instead of reopening this now-finished one.
    await finalizeSubTopicAttempt({ studentId, attemptId: resumedAttemptId });
    const nextAttemptId = await ensureSubTopicAttemptStarted(studentId, subTopicId);
    expect(nextAttemptId).not.toBe(resumedAttemptId);
  });
});

// Regression test: getQuizForSubTopic's own comment already flags that its
// serve-set (QUIZ_LENGTH-capped) must stay identical across requests, or a
// resumed quiz could show a different set of questions than the ones
// already answered. Ordering by createdAt alone couldn't guarantee that —
// a sub-topic's questions can share an identical createdAt (Bulk Upload
// inserts many questions in one statement, and Postgres evaluates
// defaultNow() once per statement, not per row), and an UPDATE on one of
// those tied rows (e.g. an admin editing/verifying it) could silently swap
// which questions got served next. Reproduces that identical-createdAt
// condition with a one-statement multi-row insert, more sub-topic questions
// than QUIZ_LENGTH, then confirms the served set/order survives an update.
describe("getQuizForSubTopic serve-set stability", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectId: string;
  let subTopicId: string;
  let mcqIds: string[];

  beforeAll(async () => {
    const [subject] = await db.insert(subjects).values({ name: `Test OrderStability Subject ${runId}` }).returning();
    subjectId = subject.id;
    const [testModule] = await db
      .insert(modules)
      .values({ subjectId, grade: "10", name: `Test OrderStability Module ${runId}` })
      .returning();
    const [subTopic] = await db
      .insert(subTopics)
      .values({ moduleId: testModule.id, name: `Test OrderStability Sub-topic ${runId}` })
      .returning();
    subTopicId = subTopic.id;

    // More than QUIZ_LENGTH (10) questions, inserted in one statement so
    // every row shares an identical createdAt.
    const inserted = await db
      .insert(mcqs)
      .values(
        Array.from({ length: 12 }, (_, i) => ({
          subTopicId,
          questionText: `Stability Q${i + 1} ${runId}`,
          options: textOptions("A", "B"),
          correctOption: 0,
          status: "published" as const,
        })),
      )
      .returning({ id: mcqs.id });
    mcqIds = inserted.map((r) => r.id);
  });

  afterAll(async () => {
    await db.delete(subjects).where(eq(subjects.id, subjectId));
  });

  it("serves the same set and order of questions after an update on one of them", async () => {
    const createdAtRows = await db
      .select({ createdAt: mcqs.createdAt })
      .from(mcqs)
      .where(eq(mcqs.subTopicId, subTopicId));
    expect(new Set(createdAtRows.map((r) => r.createdAt.getTime())).size).toBe(1);

    // There's no canonical "original order" to preserve for a heterogeneous
    // sub-topic serve-set (unlike a paper's own questions) — only that it
    // stays exactly the same across requests, so `before` here is the
    // baseline to compare against, not an expectation of matching insertion
    // order.
    const before = await getQuizForSubTopic(subTopicId);
    expect(before.questions).toHaveLength(10);
    expect(new Set(before.questions.map((q) => q.id)).size).toBe(10);

    // Simulate an admin editing one already-served question's difficulty —
    // any single-column update on a tied row is enough to trigger the bug.
    await db.update(mcqs).set({ difficulty: "hard" }).where(eq(mcqs.id, mcqIds[3]));

    const after = await getQuizForSubTopic(subTopicId);
    expect(after.questions.map((q) => q.id)).toEqual(before.questions.map((q) => q.id));
  });
});

afterAll(async () => {
  await pool.end();
});
