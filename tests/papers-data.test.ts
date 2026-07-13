import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { mcqs, modules, papers, quizAttempts, subjects, users } from "@/db/schema";
import { ensurePaperAttemptStarted, finalizePaperAttempt, MARKS_PER_QUESTION, saveQuizAnswer } from "@/lib/quiz";
import { getGradesWithPapers, getPaperOverview, getPapersForGrade, getSubjectsForGrade } from "@/lib/papers";
import { textOptions } from "./helpers";

// Covers the new grade-wide, multi-subject data layer behind the Papers
// grid/overview redesign — getGradesWithPapers, getPapersForGrade,
// getPaperOverview. The attempt-status transition matrix itself
// (not_started -> in_progress -> completed -> retake) is already exercised
// in depth in paper-flow.test.ts via these same functions; this file focuses
// on what's actually new here: spanning multiple subjects in one fetch, the
// medium filter applying the same way to every subject (a subject carries no
// medium of its own — see CLAUDE.md "Medium and papers"), live
// published-only question counts/marks, and the overview's read-only
// guarantee.
describe("papers grid data layer", () => {
  const runId = randomUUID().slice(0, 8);
  let scienceSubjectId: string;
  let secondSubjectId: string;
  let studentId: string;
  let sciencePaperId: string;
  let scienceSinhalaPaperId: string;
  let secondSubjectSinhalaPaperId: string;
  let secondSubjectEnglishPaperId: string;
  let draftPaperId: string;
  let otherGradePaperId: string;

  beforeAll(async () => {
    const [science] = await db.insert(subjects).values({ name: `Grid Science ${runId}` }).returning();
    scienceSubjectId = science.id;

    const [second] = await db.insert(subjects).values({ name: `Grid Second Subject ${runId}` }).returning();
    secondSubjectId = second.id;

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

    // A genuine Sinhala-medium paper for the same Science subject — proves
    // the medium filter is a real, overridable choice (both this and the
    // English paper above are reachable, just not at the same time) rather
    // than the English paper simply being unfiltered.
    const [scienceSinhalaPaper] = await db
      .insert(papers)
      .values({
        subjectId: scienceSubjectId,
        grade: "10",
        medium: "sinhala",
        paperType: "provincial",
        title: `Grid Science Sinhala Paper ${runId}`,
        status: "published",
      })
      .returning();
    scienceSinhalaPaperId = scienceSinhalaPaper.id;

    // A second, unrelated subject with its own Sinhala and English papers —
    // proves the same medium filter applies uniformly across every subject
    // in the grade, not just the first one.
    const [secondSinhala] = await db
      .insert(papers)
      .values({
        subjectId: secondSubjectId,
        grade: "10",
        medium: "sinhala",
        paperType: "district",
        title: `Grid Second Subject Sinhala Paper ${runId}`,
        status: "published",
      })
      .returning();
    secondSubjectSinhalaPaperId = secondSinhala.id;

    const [secondEnglish] = await db
      .insert(papers)
      .values({
        subjectId: secondSubjectId,
        grade: "10",
        medium: "english",
        paperType: "district",
        title: `Grid Second Subject English Paper ${runId}`,
        status: "published",
      })
      .returning();
    secondSubjectEnglishPaperId = secondEnglish.id;

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
    await db.delete(subjects).where(eq(subjects.id, secondSubjectId));
    await db.delete(users).where(eq(users.id, studentId));
  });

  it("getGradesWithPapers lists a grade once it has at least one published paper", async () => {
    const grades = await getGradesWithPapers();
    expect(grades).toContain("10");
    expect(grades).toContain("11");
  });

  it("getPapersForGrade spans every subject for the grade and counts only published questions", async () => {
    const cards = await getPapersForGrade({ grade: "10", medium: "english", studentId });

    const scienceCard = cards.find((c) => c.id === sciencePaperId);
    expect(scienceCard).toBeDefined();
    expect(scienceCard?.subjectId).toBe(scienceSubjectId);
    expect(scienceCard?.questionCount).toBe(2);
    expect(scienceCard?.totalMarks).toBe(2 * MARKS_PER_QUESTION);
    expect(scienceCard?.timeLimitMinutes).toBe(45);
    expect(scienceCard?.status).toBe("not_started");

    // The second subject's own English paper is included alongside Science's
    // — the fetch genuinely spans every subject for the grade, not just one.
    expect(cards.some((c) => c.id === secondSubjectEnglishPaperId)).toBe(true);
    // Its Sinhala paper is excluded from this English-medium request — the
    // filter applies the same way to every subject, no exemptions.
    expect(cards.some((c) => c.id === secondSubjectSinhalaPaperId)).toBe(false);

    // Draft papers and a different grade's paper never show up.
    expect(cards.some((c) => c.id === draftPaperId)).toBe(false);
    expect(cards.some((c) => c.id === otherGradePaperId)).toBe(false);
  });

  // This is the core "default, not a restriction" behavior: requesting a
  // different medium doesn't just fail to find the English paper, it swaps
  // in whichever paper actually matches — for every subject in the grade,
  // uniformly, since no subject carries a medium of its own to be exempted
  // by.
  it("getPapersForGrade is a default, not a restriction — requesting a different medium surfaces that medium's own papers instead of excluding everything", async () => {
    const englishView = await getPapersForGrade({ grade: "10", medium: "english", studentId });
    expect(englishView.some((c) => c.id === sciencePaperId)).toBe(true);
    // The Sinhala Science paper isn't hidden forever — it's just not part of
    // this particular (English) view.
    expect(englishView.some((c) => c.id === scienceSinhalaPaperId)).toBe(false);
    expect(englishView.some((c) => c.id === secondSubjectEnglishPaperId)).toBe(true);
    expect(englishView.some((c) => c.id === secondSubjectSinhalaPaperId)).toBe(false);

    const sinhalaView = await getPapersForGrade({ grade: "10", medium: "sinhala", studentId });
    // Switching to Sinhala genuinely surfaces the Sinhala papers for both
    // subjects...
    expect(sinhalaView.some((c) => c.id === scienceSinhalaPaperId)).toBe(true);
    expect(sinhalaView.some((c) => c.id === secondSubjectSinhalaPaperId)).toBe(true);
    // ...and now excludes the English ones instead — proving both mediums
    // are reachable for every subject, just never in the same view.
    expect(sinhalaView.some((c) => c.id === sciencePaperId)).toBe(false);
    expect(sinhalaView.some((c) => c.id === secondSubjectEnglishPaperId)).toBe(false);
  });

  it("getPaperOverview returns the paper's stats/status shape, with a null answeredCount before anything is started", async () => {
    const overview = await getPaperOverview({ paperId: sciencePaperId, studentId });

    expect(overview).not.toBeNull();
    expect(overview?.subjectId).toBe(scienceSubjectId);
    expect(overview?.grade).toBe("10");
    expect(overview?.medium).toBe("english");
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
    const before = await db.select().from(quizAttempts).where(eq(quizAttempts.paperId, secondSubjectSinhalaPaperId));
    expect(before).toHaveLength(0);

    await getPaperOverview({ paperId: secondSubjectSinhalaPaperId, studentId });
    await getPaperOverview({ paperId: secondSubjectSinhalaPaperId, studentId });

    const after = await db.select().from(quizAttempts).where(eq(quizAttempts.paperId, secondSubjectSinhalaPaperId));
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

// Backs the Dashboard's "Your subjects" switcher — there's no per-student
// enrollment table in this single-tenant schema, so "the student's
// subjects" is defined as: has at least one Topic/module for the grade, OR
// at least one published paper for the grade (a subject could plausibly
// have only past papers and no topic breakdown yet, or vice versa).
describe("getSubjectsForGrade", () => {
  const runId = randomUUID().slice(0, 8);
  let moduleOnlySubjectId: string;
  let paperOnlySubjectId: string;
  let bothSubjectId: string;
  let draftOnlySubjectId: string;
  let otherGradeSubjectId: string;

  beforeAll(async () => {
    const [moduleOnly] = await db.insert(subjects).values({ name: `Subjects Module Only ${runId}` }).returning();
    moduleOnlySubjectId = moduleOnly.id;
    await db.insert(modules).values({ subjectId: moduleOnlySubjectId, grade: "10", name: `M ${runId}`, sortOrder: 0 });

    const [paperOnly] = await db.insert(subjects).values({ name: `Subjects Paper Only ${runId}` }).returning();
    paperOnlySubjectId = paperOnly.id;
    await db.insert(papers).values({
      subjectId: paperOnlySubjectId,
      grade: "10",
      medium: "english",
      paperType: "provincial",
      title: `Subjects Paper Only Paper ${runId}`,
      status: "published",
    });

    const [both] = await db.insert(subjects).values({ name: `Subjects Both ${runId}` }).returning();
    bothSubjectId = both.id;
    await db.insert(modules).values({ subjectId: bothSubjectId, grade: "10", name: `Both Module ${runId}`, sortOrder: 0 });
    await db.insert(papers).values({
      subjectId: bothSubjectId,
      grade: "10",
      medium: "english",
      paperType: "provincial",
      title: `Subjects Both Paper ${runId}`,
      status: "published",
    });

    const [draftOnly] = await db.insert(subjects).values({ name: `Subjects Draft Only ${runId}` }).returning();
    draftOnlySubjectId = draftOnly.id;
    await db.insert(papers).values({
      subjectId: draftOnlySubjectId,
      grade: "10",
      medium: "english",
      paperType: "provincial",
      title: `Subjects Draft Paper ${runId}`,
      status: "draft",
    });

    const [otherGrade] = await db.insert(subjects).values({ name: `Subjects Other Grade ${runId}` }).returning();
    otherGradeSubjectId = otherGrade.id;
    await db.insert(modules).values({ subjectId: otherGradeSubjectId, grade: "11", name: `OG ${runId}`, sortOrder: 0 });
  });

  afterAll(async () => {
    await db.delete(subjects).where(eq(subjects.id, moduleOnlySubjectId));
    await db.delete(subjects).where(eq(subjects.id, paperOnlySubjectId));
    await db.delete(subjects).where(eq(subjects.id, bothSubjectId));
    await db.delete(subjects).where(eq(subjects.id, draftOnlySubjectId));
    await db.delete(subjects).where(eq(subjects.id, otherGradeSubjectId));
  });

  it("includes a subject with only a module, and one with only a published paper", async () => {
    const result = await getSubjectsForGrade("10");
    expect(result.some((s) => s.id === moduleOnlySubjectId)).toBe(true);
    expect(result.some((s) => s.id === paperOnlySubjectId)).toBe(true);
  });

  it("includes a subject with both a module and a paper exactly once, not duplicated", async () => {
    const result = await getSubjectsForGrade("10");
    expect(result.filter((s) => s.id === bothSubjectId)).toHaveLength(1);
  });

  it("excludes a subject whose only paper is a draft", async () => {
    const result = await getSubjectsForGrade("10");
    expect(result.some((s) => s.id === draftOnlySubjectId)).toBe(false);
  });

  it("excludes a subject that only has content for a different grade", async () => {
    const result = await getSubjectsForGrade("10");
    expect(result.some((s) => s.id === otherGradeSubjectId)).toBe(false);
    expect(await getSubjectsForGrade("11")).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: otherGradeSubjectId })]),
    );
  });
});

// A single file-level pool.end(), run once after both describes above have
// finished, rather than inside the first describe's own afterAll — this
// file now has two describes that hit the database, and closing the pool
// inside the first one's afterAll would break the second's beforeAll/tests.
afterAll(async () => {
  await pool.end();
});
