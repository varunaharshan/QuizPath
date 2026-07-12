import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { masteryScores, mcqs, modules, papers, subjects, subTopics, users } from "@/db/schema";
import {
  ensurePaperAttemptStarted,
  getMasteryPairsForMcqs,
  getQuizForPaper,
  recalculateMasteryPairs,
} from "@/lib/quiz";
import { submitFullPaperQuiz, submitFullSubTopicQuiz, textOptions } from "./helpers";

// Confirms mastery_scores is a cumulative running ratio across every attempt
// that touches a sub-topic — provincial/district/school paper questions and
// ordinary sub-topic-quiz questions alike — rather than being overwritten by
// whichever attempt happened most recently.
describe("cumulative mastery across papers and sub-topic quizzes", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectId: string;
  let moduleId: string;
  let subTopicId: string;
  let studentId: string;
  let paper1Id: string;
  let paper2Id: string;
  // Tagged with the sub-topic: these are what should feed mastery.
  let paper1TaggedMcqId: string;
  let paper2TaggedMcqId: string;
  let directSubTopicMcqId: string;
  // Untagged filler questions in each paper: must NOT affect this sub-topic's mastery.
  let paper1FillerMcqId: string;
  let paper2FillerMcqId: string;

  beforeAll(async () => {
    const [subject] = await db
      .insert(subjects)
      .values({ name: `Test Mastery Subject ${runId}` })
      .returning();
    subjectId = subject.id;

    const [testModule] = await db
      .insert(modules)
      .values({ subjectId, grade: "10", name: `Test Mastery Module ${runId}`, sortOrder: 0 })
      .returning();
    moduleId = testModule.id;

    const [subTopic] = await db
      .insert(subTopics)
      .values({ moduleId, name: `Test Mastery Sub-topic ${runId}`, sortOrder: 0 })
      .returning();
    subTopicId = subTopic.id;

    const [paper1] = await db
      .insert(papers)
      .values({
        subjectId,
        grade: "10",
        medium: "english",
        paperType: "provincial",
        title: `Test Mastery Paper 1 ${runId}`,
        status: "published",
      })
      .returning();
    paper1Id = paper1.id;

    const [paper2] = await db
      .insert(papers)
      .values({
        subjectId,
        grade: "10",
        medium: "english",
        paperType: "district",
        title: `Test Mastery Paper 2 ${runId}`,
        status: "published",
      })
      .returning();
    paper2Id = paper2.id;

    const [p1Tagged, p1Filler] = await db
      .insert(mcqs)
      .values([
        {
          paperId: paper1Id,
          subTopicId,
          questionText: "Paper 1 tagged question",
          options: textOptions("A", "B"),
          correctOption: 0,
          status: "published",
        },
        {
          paperId: paper1Id,
          questionText: "Paper 1 untagged filler question",
          options: textOptions("A", "B"),
          correctOption: 0,
          status: "published",
        },
      ])
      .returning({ id: mcqs.id });
    paper1TaggedMcqId = p1Tagged.id;
    paper1FillerMcqId = p1Filler.id;

    const [p2Tagged, p2Filler] = await db
      .insert(mcqs)
      .values([
        {
          paperId: paper2Id,
          subTopicId,
          questionText: "Paper 2 tagged question",
          options: textOptions("A", "B"),
          correctOption: 0,
          status: "published",
        },
        {
          paperId: paper2Id,
          questionText: "Paper 2 untagged filler question",
          options: textOptions("A", "B"),
          correctOption: 0,
          status: "published",
        },
      ])
      .returning({ id: mcqs.id });
    paper2TaggedMcqId = p2Tagged.id;
    paper2FillerMcqId = p2Filler.id;

    const [directMcq] = await db
      .insert(mcqs)
      .values({
        subTopicId,
        questionText: "Direct sub-topic quiz question",
        options: textOptions("A", "B"),
        correctOption: 0,
        status: "published",
      })
      .returning({ id: mcqs.id });
    directSubTopicMcqId = directMcq.id;

    const [student] = await db
      .insert(users)
      .values({ authProviderId: `test-mastery-auth-${runId}`, email: `test-mastery-${runId}@example.com` })
      .returning();
    studentId = student.id;
  });

  afterAll(async () => {
    await db.delete(subjects).where(eq(subjects.id, subjectId));
    await db.delete(modules).where(eq(modules.id, moduleId));
    await db.delete(users).where(eq(users.id, studentId));
  });

  it("resolves each paper question's own topic tag from its sub_topic_id, independent of its neighbors", async () => {
    const quiz = await getQuizForPaper(paper1Id);
    const tagged = quiz.questions.find((q) => q.id === paper1TaggedMcqId);
    const filler = quiz.questions.find((q) => q.id === paper1FillerMcqId);
    expect(tagged?.subTopicName).toBe(`Test Mastery Sub-topic ${runId}`);
    expect(filler?.subTopicName).toBeNull();
  });

  it("combines two separate papers' tagged questions into one cumulative mastery score", async () => {
    // Paper 1: tagged question correct, untagged filler wrong (filler must not count).
    await ensurePaperAttemptStarted(studentId, paper1Id);
    await submitFullPaperQuiz({
      studentId,
      paperId: paper1Id,
      answers: { [paper1TaggedMcqId]: 0, [paper1FillerMcqId]: 1 },
    });

    let mastery = await db.query.masteryScores.findFirst({
      where: eq(masteryScores.subTopicId, subTopicId),
    });
    expect(mastery?.questionsAnswered).toBe(1);
    expect(Number(mastery?.score)).toBe(100);

    // Paper 2: tagged question WRONG this time. If mastery were overwritten
    // by the latest attempt alone, this would now read 0% — it must instead
    // combine with paper 1's result into a single running ratio.
    await ensurePaperAttemptStarted(studentId, paper2Id);
    await submitFullPaperQuiz({
      studentId,
      paperId: paper2Id,
      answers: { [paper2TaggedMcqId]: 1, [paper2FillerMcqId]: 0 },
    });

    mastery = await db.query.masteryScores.findFirst({
      where: eq(masteryScores.subTopicId, subTopicId),
    });
    expect(mastery?.questionsAnswered).toBe(2);
    expect(Number(mastery?.score)).toBeCloseTo(50, 1); // 1 correct of 2 total, combined

    // A single masteryScores row per (student, sub-topic) — not one per attempt.
    const allMasteryRows = await db
      .select()
      .from(masteryScores)
      .where(eq(masteryScores.subTopicId, subTopicId));
    expect(allMasteryRows).toHaveLength(1);
  });

  it("keeps accumulating when a direct sub-topic quiz (not a paper) also touches the same sub-topic", async () => {
    // Continuing from the previous test's state: 1 correct of 2 total so far.
    // A third, correct answer via the ordinary sub-topic-quiz flow should
    // fold into the same cumulative total (now 2 of 3), regardless of the
    // fact that it didn't come from any paper at all.
    await submitFullSubTopicQuiz({
      studentId,
      subTopicId,
      answers: { [directSubTopicMcqId]: 0 },
    });

    const mastery = await db.query.masteryScores.findFirst({
      where: eq(masteryScores.subTopicId, subTopicId),
    });
    expect(mastery?.questionsAnswered).toBe(3);
    expect(Number(mastery?.score)).toBeCloseTo(66.67, 1); // 2 correct of 3 total
  });
});

// Regression coverage for the reported bug: deleting a paper (or a single
// question) correctly cascades away its mcqs/quiz_attempt_answers rows, but
// mastery_scores is a cache that's never touched by that cascade — so a
// sub-topic's cached score could keep referencing answers that no longer
// exist. getMasteryPairsForMcqs/recalculateMasteryPairs (src/lib/quiz.ts)
// fix this; deletePaper/deleteQuestion (the admin Server Actions) call them
// around the delete. Server Actions themselves aren't directly unit-tested
// in this codebase (same Clerk-mocking rationale as every other admin
// action), so these tests exercise the exact same sequence deletePaper
// performs, at the library level.
describe("mastery_scores recalculation after deleting questions", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectId: string;
  let subTopicId: string;
  let studentId: string;

  beforeAll(async () => {
    const [subject] = await db.insert(subjects).values({ name: `Test MasteryDelete Subject ${runId}` }).returning();
    subjectId = subject.id;
    const [mod] = await db.insert(modules).values({ subjectId, grade: "10", name: `Test MasteryDelete Module ${runId}` }).returning();
    const [subTopic] = await db.insert(subTopics).values({ moduleId: mod.id, name: `Test MasteryDelete SubTopic ${runId}` }).returning();
    subTopicId = subTopic.id;
    const [student] = await db
      .insert(users)
      .values({ authProviderId: `test-masterydelete-auth-${runId}`, email: `test-masterydelete-${runId}@example.com` })
      .returning();
    studentId = student.id;
  });

  afterAll(async () => {
    await db.delete(subjects).where(eq(subjects.id, subjectId));
    await db.delete(users).where(eq(users.id, studentId));
  });

  it("recalculates a sub-topic's cached mastery after its paper is deleted, reflecting only what's left", async () => {
    const [paper] = await db
      .insert(papers)
      .values({ subjectId, grade: "10", medium: "english", paperType: "school", title: `Test MasteryDelete Paper ${runId}` })
      .returning();
    const [paperMcq] = await db
      .insert(mcqs)
      .values({ paperId: paper.id, subTopicId, questionText: `Paper Q ${runId}`, options: textOptions("A", "B"), correctOption: 0, status: "published" })
      .returning({ id: mcqs.id });
    const [standaloneMcq] = await db
      .insert(mcqs)
      .values({ subTopicId, questionText: `Standalone Q ${runId}`, options: textOptions("A", "B"), correctOption: 0, status: "published" })
      .returning({ id: mcqs.id });

    await ensurePaperAttemptStarted(studentId, paper.id);
    await submitFullPaperQuiz({ studentId, paperId: paper.id, answers: { [paperMcq.id]: 0 } });
    await submitFullSubTopicQuiz({ studentId, subTopicId, answers: { [standaloneMcq.id]: 0 } });

    const before = await db.query.masteryScores.findFirst({ where: eq(masteryScores.subTopicId, subTopicId) });
    expect(before?.questionsAnswered).toBe(2);
    expect(Number(before?.score)).toBe(100);

    // Mirrors exactly what deletePaper (src/app/admin/papers/actions.ts) does:
    // gather the affected pairs BEFORE deleting (the delete cascades away
    // the very quiz_attempt_answers rows needed to find them), delete, then
    // recalculate.
    const affectedPairs = await getMasteryPairsForMcqs([paperMcq.id]);
    await db.delete(papers).where(eq(papers.id, paper.id));
    await recalculateMasteryPairs(affectedPairs);

    const after = await db.query.masteryScores.findFirst({ where: eq(masteryScores.subTopicId, subTopicId) });
    // Only the standalone question's answer is left — not stuck at 2/100%.
    expect(after?.questionsAnswered).toBe(1);
    expect(Number(after?.score)).toBe(100);
  });

  it("recalculates after deleting a single (non-paper) question, without needing to retake a quiz", async () => {
    const [mcqA] = await db
      .insert(mcqs)
      .values({ subTopicId, questionText: `Solo Q A ${runId}`, options: textOptions("A", "B"), correctOption: 0, status: "published" })
      .returning({ id: mcqs.id });
    const [mcqB] = await db
      .insert(mcqs)
      .values({ subTopicId, questionText: `Solo Q B ${runId}`, options: textOptions("A", "B"), correctOption: 0, status: "published" })
      .returning({ id: mcqs.id });

    // A answered correctly, B answered wrong.
    await submitFullSubTopicQuiz({ studentId, subTopicId, answers: { [mcqA.id]: 0, [mcqB.id]: 1 } });

    const before = await db.query.masteryScores.findFirst({ where: eq(masteryScores.subTopicId, subTopicId) });
    const beforeAnswered = before!.questionsAnswered;
    expect(Number(before?.score)).toBeLessThan(100); // B's wrong answer is dragging it down

    // Delete the wrong answer's question — mirrors deleteQuestion (src/app/admin/papers/[paperId]/questions/actions.ts).
    const affectedPairs = await getMasteryPairsForMcqs([mcqB.id]);
    await db.delete(mcqs).where(eq(mcqs.id, mcqB.id));
    await recalculateMasteryPairs(affectedPairs);

    const after = await db.query.masteryScores.findFirst({ where: eq(masteryScores.subTopicId, subTopicId) });
    expect(after?.questionsAnswered).toBe(beforeAnswered - 1);
    expect(Number(after?.score)).toBe(100); // only the correct answer remains
  });

  it("getMasteryPairsForMcqs returns an empty list for questions nobody has ever answered", async () => {
    const [unansweredMcq] = await db
      .insert(mcqs)
      .values({ subTopicId, questionText: `Never Answered Q ${runId}`, options: textOptions("A", "B"), correctOption: 0, status: "published" })
      .returning({ id: mcqs.id });

    const pairs = await getMasteryPairsForMcqs([unansweredMcq.id]);
    expect(pairs).toEqual([]);

    // Must be a safe no-op, not an error.
    await expect(recalculateMasteryPairs(pairs)).resolves.toBeUndefined();
  });
});

afterAll(async () => {
  await pool.end();
});
