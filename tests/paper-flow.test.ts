import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { mcqs, papers, quizAttempts, subjects, users } from "@/db/schema";
import { ensurePaperAttemptStarted, getQuizForPaper, submitPaperQuizAttempt } from "@/lib/quiz";
import { getPapersForSubject } from "@/lib/papers";

describe("paper-based quiz flow", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectId: string;
  let paperId: string;
  let otherGradePaperId: string;
  let studentId: string;
  let mcqIds: string[];
  let draftMcqId: string;

  beforeAll(async () => {
    const [subject] = await db
      .insert(subjects)
      .values({ name: `Test Paper Subject ${runId}` })
      .returning();
    subjectId = subject.id;

    const [paper] = await db
      .insert(papers)
      .values({
        subjectId,
        grade: "10",
        medium: "english",
        paperType: "provincial",
        title: `Test Provincial Paper ${runId}`,
        year: 2024,
        status: "published",
      })
      .returning();
    paperId = paper.id;

    // A paper for a different grade — must never show up when listing Grade 10 papers.
    const [otherPaper] = await db
      .insert(papers)
      .values({
        subjectId,
        grade: "11",
        medium: "english",
        paperType: "provincial",
        title: `Wrong Grade Paper ${runId}`,
        status: "published",
      })
      .returning();
    otherGradePaperId = otherPaper.id;

    const inserted = await db
      .insert(mcqs)
      .values([
        { paperId, questionText: "1 + 1 = ?", options: ["1", "2", "3", "4"], correctOption: 1, status: "published" },
        { paperId, questionText: "2 + 2 = ?", options: ["3", "4", "5", "6"], correctOption: 1, status: "published" },
        { paperId, questionText: "3 + 3 = ?", options: ["5", "6", "7", "8"], correctOption: 1, status: "published" },
        {
          paperId,
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
      .values({ authProviderId: `test-paper-auth-${runId}`, email: `test-paper-${runId}@example.com` })
      .returning();
    studentId = student.id;
  });

  afterAll(async () => {
    // Deleting the subject cascades papers -> mcqs/quiz_attempts (-> quiz_attempt_answers).
    await db.delete(subjects).where(eq(subjects.id, subjectId));
    await db.delete(users).where(eq(users.id, studentId));
    await pool.end();
  });

  it("lists the paper grouped by paper_type, filtered by grade/medium, status not_started", async () => {
    const grouped = await getPapersForSubject({
      subjectId,
      grade: "10",
      medium: "english",
      studentId,
    });

    expect(grouped.provincial).toHaveLength(1);
    expect(grouped.provincial[0].id).toBe(paperId);
    expect(grouped.provincial[0].status).toBe("not_started");
    expect(grouped.district).toHaveLength(0);
    expect(grouped.school).toHaveLength(0);
    // The Grade 11 paper must not leak into a Grade 10 listing.
    expect(grouped.provincial.some((p) => p.id === otherGradePaperId)).toBe(false);
  });

  it("serves every published question with no cap, without leaking the answer key", async () => {
    const quiz = await getQuizForPaper(paperId);
    expect(quiz.paper?.id).toBe(paperId);
    expect(quiz.questions).toHaveLength(3);
    expect(quiz.questions.map((q) => q.id).sort()).toEqual([...mcqIds].sort());
    expect(quiz.questions.some((q) => q.id === draftMcqId)).toBe(false);
    for (const q of quiz.questions) {
      expect(q).not.toHaveProperty("correctOption");
    }
  });

  it("marks the paper in_progress after opening it, before any submission", async () => {
    const attemptId = await ensurePaperAttemptStarted(studentId, paperId);
    expect(attemptId).toBeTruthy();

    const grouped = await getPapersForSubject({
      subjectId,
      grade: "10",
      medium: "english",
      studentId,
    });
    expect(grouped.provincial[0].status).toBe("in_progress");

    // Idempotent: opening it again reuses the same in-progress row.
    const attemptIdAgain = await ensurePaperAttemptStarted(studentId, paperId);
    expect(attemptIdAgain).toBe(attemptId);
  });

  it("submits, grades, and completes the same in-progress attempt (no new row), doesn't touch mastery_scores", async () => {
    const [q1, q2, q3] = mcqIds;
    const result = await submitPaperQuizAttempt({
      studentId,
      paperId,
      answers: { [q1]: 1, [q2]: 1, [q3]: 0 }, // 2 correct, 1 wrong -> 66.67%
    });

    expect(result.total).toBe(3);
    expect(result.correctCount).toBe(2);
    expect(result.score).toBeCloseTo(66.67, 1);

    const allAttempts = await db
      .select()
      .from(quizAttempts)
      .where(eq(quizAttempts.paperId, paperId));
    expect(allAttempts).toHaveLength(1);
    expect(allAttempts[0].id).toBe(result.attemptId);
    expect(allAttempts[0].completedAt).not.toBeNull();
    expect(allAttempts[0].subTopicId).toBeNull();

    const mastery = await db.query.masteryScores.findFirst({
      where: (m, { eq }) => eq(m.studentId, studentId),
    });
    expect(mastery).toBeUndefined();

    const grouped = await getPapersForSubject({
      subjectId,
      grade: "10",
      medium: "english",
      studentId,
    });
    expect(grouped.provincial[0].status).toBe("completed");
  });

  it("starts a fresh attempt (a second row) on retake, rather than reusing the completed one", async () => {
    const retakeAttemptId = await ensurePaperAttemptStarted(studentId, paperId);

    const allAttempts = await db
      .select()
      .from(quizAttempts)
      .where(eq(quizAttempts.paperId, paperId));
    expect(allAttempts).toHaveLength(2);
    expect(allAttempts.some((a) => a.id === retakeAttemptId && a.completedAt === null)).toBe(true);
  });
});
