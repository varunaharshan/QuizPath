import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { mcqs, papers, quizAttempts, studentProfiles, subjects, users } from "@/db/schema";
import {
  ensurePaperAttemptStarted,
  finalizePaperAttempt,
  getExistingAnswers,
  getQuizForPaper,
  saveQuizAnswer,
} from "@/lib/quiz";
import { getPapersForGrade } from "@/lib/papers";
import { submitFullPaperQuiz, textOptions } from "./helpers";

describe("paper-based quiz flow", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectId: string;
  let paperId: string;
  let otherGradePaperId: string;
  let studentId: string;
  let mcqIds: string[];
  let draftMcqId: string;
  let otherGradeMcqIds: string[];

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

    const otherGradeInserted = await db
      .insert(mcqs)
      .values([
        {
          paperId: otherGradePaperId,
          questionText: "10 + 10 = ?",
          options: textOptions("10", "15", "20", "25"),
          correctOption: 2,
          status: "published",
        },
        {
          paperId: otherGradePaperId,
          questionText: "20 + 20 = ?",
          options: textOptions("30", "35", "40", "45"),
          correctOption: 2,
          status: "published",
        },
      ])
      .returning({ id: mcqs.id });
    otherGradeMcqIds = otherGradeInserted.map((m) => m.id);

    const inserted = await db
      .insert(mcqs)
      .values([
        {
          paperId,
          questionText: "1 + 1 = ?",
          options: textOptions("1", "2", "3", "4"),
          correctOption: 1,
          status: "published",
          hint: "Add one and one",
        },
        { paperId, questionText: "2 + 2 = ?", options: textOptions("3", "4", "5", "6"), correctOption: 1, status: "published" },
        { paperId, questionText: "3 + 3 = ?", options: textOptions("5", "6", "7", "8"), correctOption: 1, status: "published" },
        {
          paperId,
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
      .values({ authProviderId: `test-paper-auth-${runId}`, email: `test-paper-${runId}@example.com` })
      .returning();
    studentId = student.id;

    // The student's own profile grade is "10" — used below to confirm
    // Practice's Grade step lets them freely browse Grade 11 papers too,
    // without that browsing choice ever touching this row.
    await db.insert(studentProfiles).values({ userId: studentId, grade: "10", medium: "english" });
  });

  afterAll(async () => {
    // Deleting the subject cascades papers -> mcqs/quiz_attempts (-> quiz_attempt_answers).
    await db.delete(subjects).where(eq(subjects.id, subjectId));
    await db.delete(users).where(eq(users.id, studentId));
    await pool.end();
  });

  it("lists the paper for its grade/medium with status not_started, excluding a different grade's paper", async () => {
    const cards = await getPapersForGrade({ grade: "10", studentMedium: "english", studentId });
    const card = cards.find((c) => c.id === paperId);
    expect(card).toBeDefined();
    expect(card?.paperType).toBe("provincial");
    expect(card?.status).toBe("not_started");
    expect(card?.answeredCount).toBeNull();
    // The Grade 11 paper must not leak into a Grade 10 listing.
    expect(cards.some((c) => c.id === otherGradePaperId)).toBe(false);
  });

  it("serves every published question with no cap, without leaking the answer key", async () => {
    const quiz = await getQuizForPaper(paperId);
    expect(quiz.paper?.id).toBe(paperId);
    expect(quiz.questions).toHaveLength(3);
    expect(quiz.questions.map((q) => q.id).sort()).toEqual([...mcqIds].sort());
    expect(quiz.questions.some((q) => q.id === draftMcqId)).toBe(false);
    for (const q of quiz.questions) {
      expect(q).not.toHaveProperty("correctOption");
      // None of this paper's fixture questions are tagged with a sub-topic
      // — the topic tag must be null, not a fabricated/omitted field.
      expect(q.subTopicName).toBeNull();
    }

    // One fixture question has a hint, the rest don't.
    expect(quiz.questions.find((q) => q.questionText === "1 + 1 = ?")?.hint).toBe("Add one and one");
    expect(quiz.questions.find((q) => q.questionText === "2 + 2 = ?")?.hint).toBeNull();
  });

  it("marks the paper in_progress after opening it, before any submission", async () => {
    const attemptId = await ensurePaperAttemptStarted(studentId, paperId);
    expect(attemptId).toBeTruthy();

    const cards = await getPapersForGrade({ grade: "10", studentMedium: "english", studentId });
    const card = cards.find((c) => c.id === paperId);
    expect(card?.status).toBe("in_progress");
    expect(card?.answeredCount).toBe(0);

    // Idempotent: opening it again reuses the same in-progress row.
    const attemptIdAgain = await ensurePaperAttemptStarted(studentId, paperId);
    expect(attemptIdAgain).toBe(attemptId);
  });

  it("submits, grades, and completes the same in-progress attempt (no new row), doesn't touch mastery_scores", async () => {
    const [q1, q2, q3] = mcqIds;
    const result = await submitFullPaperQuiz({
      studentId,
      paperId,
      answers: { [q1]: 1, [q2]: 1, [q3]: 0 }, // 2 correct, 1 wrong -> 66.67%
    });

    expect(result.questionsAnswered).toBe(3);
    expect(result.totalQuestions).toBe(3);
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

    const cards = await getPapersForGrade({ grade: "10", studentMedium: "english", studentId });
    const card = cards.find((c) => c.id === paperId);
    expect(card?.status).toBe("completed");
    expect(card?.answeredCount).toBeNull();
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

  it("resolves Resume/Retake status correctly when browsing a grade other than the student's own profile grade", async () => {
    // The student's own student_profiles.grade is "10" (set in beforeAll); this
    // paper is Grade 11. Practice's Grade step lets a student freely browse any
    // grade for revision — this confirms status resolution is driven entirely
    // by quiz_attempts.paper_id, never by student_profiles.grade, so opening,
    // leaving incomplete, and returning to a non-default grade's paper still
    // correctly shows "Resume" (and later "Retake"), exactly as it would for
    // the student's own grade.
    const profile = await db.query.studentProfiles.findFirst({
      where: (p, { eq }) => eq(p.userId, studentId),
    });
    expect(profile?.grade).toBe("10");

    const attemptId = await ensurePaperAttemptStarted(studentId, otherGradePaperId);
    expect(attemptId).toBeTruthy();

    // Simulates navigating away and back: re-listing the Grade 11 papers
    // should show "Resume" for this still-incomplete attempt.
    let cards = await getPapersForGrade({ grade: "11", studentMedium: "english", studentId });
    expect(cards.find((c) => c.id === otherGradePaperId)?.status).toBe("in_progress");

    const [oq1, oq2] = otherGradeMcqIds;
    await submitFullPaperQuiz({
      studentId,
      paperId: otherGradePaperId,
      answers: { [oq1]: 2, [oq2]: 2 }, // both correct -> 100%
    });

    cards = await getPapersForGrade({ grade: "11", studentMedium: "english", studentId });
    expect(cards.find((c) => c.id === otherGradePaperId)?.status).toBe("completed");

    // Browsing Grade 11 must never have touched the student's own grade.
    const profileAfter = await db.query.studentProfiles.findFirst({
      where: (p, { eq }) => eq(p.userId, studentId),
    });
    expect(profileAfter?.grade).toBe("10");
  });

  it("saves paper answers incrementally, resumes with them intact, then shows Retake (not Resume) after a partial submit", async () => {
    const [q1] = mcqIds;
    // Reuses the still-in-progress "retake" attempt left over from the
    // earlier retake test.
    const attemptId = await ensurePaperAttemptStarted(studentId, paperId);
    await saveQuizAnswer({ studentId, attemptId, mcqId: q1, selectedOption: 1 });

    // Simulates navigating away without submitting, then returning: same
    // attempt, same answer, still just "Resume".
    const resumedAttemptId = await ensurePaperAttemptStarted(studentId, paperId);
    expect(resumedAttemptId).toBe(attemptId);
    const existingAnswers = await getExistingAnswers(resumedAttemptId);
    expect(existingAnswers[q1]).toBe(1);

    let cards = await getPapersForGrade({ grade: "10", studentMedium: "english", studentId });
    let card = cards.find((c) => c.id === paperId);
    expect(card?.status).toBe("in_progress");
    expect(card?.answeredCount).toBe(1);

    // Explicitly submitting with only 1 of 3 questions answered ends this
    // session — status must flip to "completed" (Retake), not stay "Resume".
    await finalizePaperAttempt({ studentId, attemptId: resumedAttemptId });

    cards = await getPapersForGrade({ grade: "10", studentMedium: "english", studentId });
    card = cards.find((c) => c.id === paperId);
    expect(card?.status).toBe("completed");

    const nextAttemptId = await ensurePaperAttemptStarted(studentId, paperId);
    expect(nextAttemptId).not.toBe(resumedAttemptId);
  });

  it("blocks finalizing a paper attempt with zero saved answers", async () => {
    const attemptId = await ensurePaperAttemptStarted(studentId, paperId);
    await expect(finalizePaperAttempt({ studentId, attemptId })).rejects.toThrow();

    const attempt = await db.query.quizAttempts.findFirst({ where: eq(quizAttempts.id, attemptId) });
    expect(attempt!.completedAt).toBeNull();
  });
});
