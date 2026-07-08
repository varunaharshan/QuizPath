import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { mcqs, papers, quizAttempts, subjects, users } from "@/db/schema";
import { ensurePaperAttemptStarted, finalizePaperAttempt, MARKS_PER_QUESTION, saveQuizAnswer } from "@/lib/quiz";
import { getGradesWithPapers, getPaperOverview, getPapersForGrade } from "@/lib/papers";
import { textOptions } from "./helpers";

// Covers the new grade-wide, multi-subject data layer behind the Papers
// grid/overview redesign — getGradesWithPapers, getPapersForGrade,
// getPaperOverview. The attempt-status transition matrix itself
// (not_started -> in_progress -> completed -> retake) is already exercised
// in depth in paper-flow.test.ts via these same functions; this file focuses
// on what's actually new here: spanning multiple subjects in one fetch,
// resolving medium per-subject, live published-only question counts/marks,
// and the overview's read-only guarantee.
describe("papers grid data layer", () => {
  const runId = randomUUID().slice(0, 8);
  let scienceSubjectId: string;
  let pinnedSubjectId: string;
  let studentId: string;
  let sciencePaperId: string;
  let pinnedMatchingPaperId: string;
  let pinnedMismatchPaperId: string;
  let draftPaperId: string;
  let otherGradePaperId: string;

  beforeAll(async () => {
    const [science] = await db.insert(subjects).values({ name: `Grid Science ${runId}` }).returning();
    scienceSubjectId = science.id;

    const [pinned] = await db
      .insert(subjects)
      .values({ name: `Grid Pinned Subject ${runId}`, fixedMedium: "sinhala" })
      .returning();
    pinnedSubjectId = pinned.id;

    const [sciencePaper] = await db
      .insert(papers)
      .values({
        subjectId: scienceSubjectId,
        grade: "10",
        medium: "english",
        paperType: "provincial",
        title: `Grid Science Paper ${runId}`,
        status: "published",
        timeLimitMinutes: 45,
      })
      .returning();
    sciencePaperId = sciencePaper.id;

    // Matches the subject's own fixed medium ("sinhala") — must be included
    // regardless of the student's own profile medium.
    const [pinnedMatching] = await db
      .insert(papers)
      .values({
        subjectId: pinnedSubjectId,
        grade: "10",
        medium: "sinhala",
        paperType: "district",
        title: `Grid Pinned Matching Paper ${runId}`,
        status: "published",
      })
      .returning();
    pinnedMatchingPaperId = pinnedMatching.id;

    // Same subject, but authored in English — doesn't match the subject's
    // own fixed medium, so must never show up even though the student's
    // profile medium in this test is "english".
    const [pinnedMismatch] = await db
      .insert(papers)
      .values({
        subjectId: pinnedSubjectId,
        grade: "10",
        medium: "english",
        paperType: "district",
        title: `Grid Pinned Mismatch Paper ${runId}`,
        status: "published",
      })
      .returning();
    pinnedMismatchPaperId = pinnedMismatch.id;

    const [draftPaper] = await db
      .insert(papers)
      .values({
        subjectId: scienceSubjectId,
        grade: "10",
        medium: "english",
        paperType: "school",
        title: `Grid Draft Paper ${runId}`,
        status: "draft",
      })
      .returning();
    draftPaperId = draftPaper.id;

    const [otherGrade] = await db
      .insert(papers)
      .values({
        subjectId: scienceSubjectId,
        grade: "11",
        medium: "english",
        paperType: "provincial",
        title: `Grid Grade 11 Paper ${runId}`,
        status: "published",
      })
      .returning();
    otherGradePaperId = otherGrade.id;

    await db.insert(mcqs).values([
      {
        paperId: sciencePaperId,
        questionText: "Q1",
        options: textOptions("A", "B"),
        correctOption: 0,
        status: "published",
      },
      {
        paperId: sciencePaperId,
        questionText: "Q2",
        options: textOptions("A", "B"),
        correctOption: 0,
        status: "published",
      },
      {
        paperId: sciencePaperId,
        questionText: "Draft question that should never count",
        options: textOptions("A", "B"),
        correctOption: 0,
        status: "draft",
      },
    ]);

    const [student] = await db
      .insert(users)
      .values({ authProviderId: `test-grid-auth-${runId}`, email: `test-grid-${runId}@example.com` })
      .returning();
    studentId = student.id;
  });

  afterAll(async () => {
    // Deleting the subjects cascades papers -> mcqs/quiz_attempts (-> quiz_attempt_answers).
    await db.delete(subjects).where(eq(subjects.id, scienceSubjectId));
    await db.delete(subjects).where(eq(subjects.id, pinnedSubjectId));
    await db.delete(users).where(eq(users.id, studentId));
    await pool.end();
  });

  it("getGradesWithPapers lists a grade once it has at least one published paper", async () => {
    const grades = await getGradesWithPapers();
    expect(grades).toContain("10");
    expect(grades).toContain("11");
  });

  it("getPapersForGrade spans every subject for the grade, resolving medium per-subject and counting only published questions", async () => {
    const cards = await getPapersForGrade({ grade: "10", studentMedium: "english", studentId });

    const scienceCard = cards.find((c) => c.id === sciencePaperId);
    expect(scienceCard).toBeDefined();
    expect(scienceCard?.subjectId).toBe(scienceSubjectId);
    expect(scienceCard?.questionCount).toBe(2);
    expect(scienceCard?.totalMarks).toBe(2 * MARKS_PER_QUESTION);
    expect(scienceCard?.timeLimitMinutes).toBe(45);
    expect(scienceCard?.status).toBe("not_started");

    // The pinned-medium subject's own-medium paper is included even though
    // the student's own profile medium ("english") doesn't match it...
    expect(cards.some((c) => c.id === pinnedMatchingPaperId)).toBe(true);
    // ...but that same subject's English-language paper is excluded, proving
    // medium is resolved per-paper's-own-subject, not from the student
    // globally.
    expect(cards.some((c) => c.id === pinnedMismatchPaperId)).toBe(false);

    // Draft papers and a different grade's paper never show up.
    expect(cards.some((c) => c.id === draftPaperId)).toBe(false);
    expect(cards.some((c) => c.id === otherGradePaperId)).toBe(false);
  });

  it("getPaperOverview returns the paper's stats/status shape, with a null answeredCount before anything is started", async () => {
    const overview = await getPaperOverview({ paperId: sciencePaperId, studentId });

    expect(overview).not.toBeNull();
    expect(overview?.subjectId).toBe(scienceSubjectId);
    expect(overview?.grade).toBe("10");
    expect(overview?.questionCount).toBe(2);
    expect(overview?.totalMarks).toBe(2 * MARKS_PER_QUESTION);
    expect(overview?.timeLimitMinutes).toBe(45);
    expect(overview?.status).toBe("not_started");
    expect(overview?.answeredCount).toBeNull();
  });

  it("getPaperOverview returns null for an unknown paper id", async () => {
    const overview = await getPaperOverview({ paperId: randomUUID(), studentId });
    expect(overview).toBeNull();
  });

  it("getPaperOverview never itself starts an attempt — reading it repeatedly creates no quiz_attempts row", async () => {
    const before = await db.select().from(quizAttempts).where(eq(quizAttempts.paperId, pinnedMatchingPaperId));
    expect(before).toHaveLength(0);

    await getPaperOverview({ paperId: pinnedMatchingPaperId, studentId });
    await getPaperOverview({ paperId: pinnedMatchingPaperId, studentId });

    const after = await db.select().from(quizAttempts).where(eq(quizAttempts.paperId, pinnedMatchingPaperId));
    expect(after).toHaveLength(0);
  });

  it("getPaperOverview reflects in_progress with an answered count, then completed with none once submitted", async () => {
    const attemptId = await ensurePaperAttemptStarted(studentId, sciencePaperId);
    const [question] = await db
      .select({ id: mcqs.id })
      .from(mcqs)
      .where(and(eq(mcqs.paperId, sciencePaperId), eq(mcqs.status, "published")));
    await saveQuizAnswer({ studentId, attemptId, mcqId: question.id, selectedOption: 0 });

    const inProgress = await getPaperOverview({ paperId: sciencePaperId, studentId });
    expect(inProgress?.status).toBe("in_progress");
    expect(inProgress?.answeredCount).toBe(1);

    await finalizePaperAttempt({ studentId, attemptId });

    const completed = await getPaperOverview({ paperId: sciencePaperId, studentId });
    expect(completed?.status).toBe("completed");
    expect(completed?.answeredCount).toBeNull();
  });
});
