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
import { getQuizForSubTopic, submitQuizAttempt } from "@/lib/quiz";
import { getSubTopicStatusesForGrade } from "@/lib/dashboard";

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
          options: ["3", "4", "5", "6"],
          correctOption: 1,
          status: "published",
        },
        {
          subTopicId,
          questionText: "The chemical symbol for water is:",
          options: ["O2", "H2O", "CO2", "NaCl"],
          correctOption: 1,
          status: "published",
        },
        {
          subTopicId,
          questionText: "The sun rises in the:",
          options: ["West", "North", "East", "South"],
          correctOption: 2,
          status: "published",
        },
        {
          subTopicId,
          questionText: "Draft question that should never be served",
          options: ["A", "B"],
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
    await pool.end();
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
    }
  });

  it("grades an attempt, persists it, and sets mastery to 'in_progress' for a 2/3 score", async () => {
    const [q1, q2, q3] = mcqIds;
    const result = await submitQuizAttempt({
      studentId,
      subTopicId,
      answers: { [q1]: 1, [q2]: 1, [q3]: 0 }, // 2 correct, 1 wrong -> 66.67%
    });

    expect(result.total).toBe(3);
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
  });

  it("recalculates mastery to 'mastered' on a later 3/3 attempt (upsert, not a duplicate row)", async () => {
    const [q1, q2, q3] = mcqIds;
    const result = await submitQuizAttempt({
      studentId,
      subTopicId,
      answers: { [q1]: 1, [q2]: 1, [q3]: 2 }, // all correct -> 100%
    });

    expect(result.score).toBe(100);
    expect(result.masteryLabel).toBe("mastered");

    const masteryRows = await db
      .select()
      .from(masteryScores)
      .where(eq(masteryScores.subTopicId, subTopicId));
    expect(masteryRows).toHaveLength(1);
    expect(Number(masteryRows[0].score)).toBe(100);

    const allAttempts = await db
      .select()
      .from(quizAttempts)
      .where(eq(quizAttempts.subTopicId, subTopicId));
    expect(allAttempts).toHaveLength(2);
  });
});
