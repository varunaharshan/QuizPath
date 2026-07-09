import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { mcqs, modules, papers, quizAttempts, subjects, subTopics, users } from "@/db/schema";
import { ensurePaperAttemptStarted, ensureSubTopicAttemptStarted, finalizeSubTopicAttempt, saveQuizAnswer } from "@/lib/quiz";
import {
  getCompletedQuizzes,
  getMostRecentlyPracticedSubjectId,
  getOverallStats,
  getSubjectAccuracyTrends,
  getTopicStatusesForGrade,
} from "@/lib/dashboard";
import { submitFullPaperQuiz, submitFullSubTopicQuiz, textOptions } from "./helpers";

// Confirms the Dashboard's "continue where you left off" card and "recent
// activity" list stay scoped to whichever grade is asked for, even when an
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
  let grade10PaperAId: string;
  let grade10PaperBId: string;
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
        { subTopicId: grade10SubTopicId, questionText: "1 + 1 = ?", options: textOptions("1", "2", "3"), correctOption: 1, status: "published" },
      ])
      .returning({ id: mcqs.id });
    grade10McqIds = grade10Inserted.map((m) => m.id);

    const grade11Inserted = await db
      .insert(mcqs)
      .values([
        { subTopicId: grade11SubTopicId, questionText: "2 + 2 = ?", options: textOptions("3", "4", "5"), correctOption: 1, status: "published" },
      ])
      .returning({ id: mcqs.id });
    grade11McqIds = grade11Inserted.map((m) => m.id);

    const [paperA] = await db
      .insert(papers)
      .values({
        subjectId,
        grade: "10",
        medium: "english",
        paperType: "provincial",
        title: `Test Dashboard Paper A ${runId}`,
        status: "published",
      })
      .returning();
    grade10PaperAId = paperA.id;

    const [paperB] = await db
      .insert(papers)
      .values({
        subjectId,
        grade: "10",
        medium: "english",
        paperType: "district",
        title: `Test Dashboard Paper B ${runId}`,
        status: "published",
      })
      .returning();
    grade10PaperBId = paperB.id;

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
      { paperId: otherGradePaperId, questionText: "3 + 3 = ?", options: textOptions("5", "6", "7"), correctOption: 1, status: "published" },
    ]);

    const [student] = await db
      .insert(users)
      .values({ authProviderId: `test-dashboard-auth-${runId}`, email: `test-dashboard-${runId}@example.com` })
      .returning();
    studentId = student.id;

    // Complete the Grade 10 attempt first, then the Grade 11 one, so the
    // Grade 11 attempt is the most recent overall — if grade scoping weren't
    // applied, it would incorrectly win the "continue" slot for a Grade 10
    // query and leak into a Grade 10 recent-activity list.
    await submitFullSubTopicQuiz({
      studentId,
      subTopicId: grade10SubTopicId,
      answers: { [grade10McqIds[0]]: 1 },
    });
    await submitFullSubTopicQuiz({
      studentId,
      subTopicId: grade11SubTopicId,
      answers: { [grade11McqIds[0]]: 1 },
    });

    // Two in-progress Grade 10 papers, A started before B -> B is the more
    // recently touched of the two.
    await ensurePaperAttemptStarted(studentId, grade10PaperAId);
    await ensurePaperAttemptStarted(studentId, grade10PaperBId);

    // An in-progress Grade 11 paper — must win the continue slot for a
    // Grade 11 query, but never surface under a Grade 10 query.
    await ensurePaperAttemptStarted(studentId, otherGradePaperId);
  });

  afterAll(async () => {
    await db.delete(subjects).where(eq(subjects.id, subjectId));
    await db.delete(users).where(eq(users.id, studentId));
  });

  it("getCompletedQuizzes labels each row by attempt type and excludes off-grade/incomplete attempts", async () => {
    const grade10Completed = await getCompletedQuizzes(studentId, { grade: "10" });
    const grade10Entry = grade10Completed.find((q) => q.title === `Test Dashboard Sub-topic 10 ${runId}`);
    expect(grade10Entry?.type).toBe("topic_practice");
    expect(grade10Completed.map((q) => q.title)).not.toContain(`Test Dashboard Sub-topic 11 ${runId}`);
    // The in-progress papers are still incomplete, so neither shows up here.
    expect(grade10Completed.map((q) => q.title)).not.toContain(`Test Dashboard Paper A ${runId}`);
    expect(grade10Completed.map((q) => q.title)).not.toContain(`Test Dashboard Paper B ${runId}`);

    const grade11Completed = await getCompletedQuizzes(studentId, { grade: "11" });
    const grade11Entry = grade11Completed.find((q) => q.title === `Test Dashboard Sub-topic 11 ${runId}`);
    expect(grade11Entry?.type).toBe("topic_practice");
    expect(grade11Completed.map((q) => q.title)).not.toContain(`Test Dashboard Sub-topic 10 ${runId}`);
  });

  it("an unfiltered call (no grade) still returns every completed attempt, for the Active learner flag", async () => {
    const all = await getCompletedQuizzes(studentId);
    const titles = all.map((q) => q.title);
    expect(titles).toContain(`Test Dashboard Sub-topic 10 ${runId}`);
    expect(titles).toContain(`Test Dashboard Sub-topic 11 ${runId}`);
  });

  it("computes durationMinutes as the elapsed time between starting and completing the attempt", async () => {
    const all = await getCompletedQuizzes(studentId, { grade: "10" });
    const entry = all.find((q) => q.title === `Test Dashboard Sub-topic 10 ${runId}`);
    // Submitted immediately after starting in this test, so the elapsed
    // wall-clock time is tiny — just confirm it's a non-negative number,
    // not the exact value (which depends on real test-run timing).
    expect(entry?.durationMinutes).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(entry?.durationMinutes)).toBe(true);
  });
});

// Backs Practice by Topic's default subject tab (see CLAUDE.md "Practice
// (Weak Areas, By Topic, By Keyword)") — uses two distinct subjects (one
// resolved via a sub-topic attempt, one via a paper attempt) so the test
// actually exercises subject *resolution*, not just grade scoping (which
// the shared "dashboard grade scoping" fixture above already covers with a
// single subject).
describe("getMostRecentlyPracticedSubjectId", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectAId: string;
  let subjectBId: string;
  let subTopicAId: string;
  let paperBId: string;
  let mcqAId: string;
  let studentId: string;

  beforeAll(async () => {
    const [subjectA] = await db.insert(subjects).values({ name: `Test MostRecent Subject A ${runId}` }).returning();
    subjectAId = subjectA.id;
    const [subjectB] = await db.insert(subjects).values({ name: `Test MostRecent Subject B ${runId}` }).returning();
    subjectBId = subjectB.id;

    const [moduleA] = await db
      .insert(modules)
      .values({ subjectId: subjectAId, grade: "10", name: `Test MostRecent Module A ${runId}`, sortOrder: 0 })
      .returning();

    const [subTopicA] = await db
      .insert(subTopics)
      .values({ moduleId: moduleA.id, name: `Test MostRecent Sub-topic A ${runId}`, sortOrder: 0 })
      .returning();
    subTopicAId = subTopicA.id;

    const [mcqA] = await db
      .insert(mcqs)
      .values({ subTopicId: subTopicAId, questionText: "1 + 1 = ?", options: textOptions("1", "2"), correctOption: 1, status: "published" })
      .returning({ id: mcqs.id });
    mcqAId = mcqA.id;

    const [paperB] = await db
      .insert(papers)
      .values({ subjectId: subjectBId, grade: "10", medium: "english", paperType: "provincial", title: `Test MostRecent Paper B ${runId}`, status: "published" })
      .returning();
    paperBId = paperB.id;

    const [mcqB] = await db
      .insert(mcqs)
      .values({ paperId: paperBId, questionText: "2 + 2 = ?", options: textOptions("3", "4"), correctOption: 1, status: "published" })
      .returning({ id: mcqs.id });

    const [student] = await db
      .insert(users)
      .values({ authProviderId: `test-mostrecent-auth-${runId}`, email: `test-mostrecent-${runId}@example.com` })
      .returning();
    studentId = student.id;

    // Complete subject A's sub-topic attempt first, so subject B's paper
    // attempt (completed after) is the more recent of the two.
    await submitFullSubTopicQuiz({ studentId, subTopicId: subTopicAId, answers: { [mcqAId]: 1 } });
    await submitFullPaperQuiz({ studentId, paperId: paperBId, answers: { [mcqB.id]: 1 } });
  });

  afterAll(async () => {
    await db.delete(subjects).where(eq(subjects.id, subjectAId));
    await db.delete(subjects).where(eq(subjects.id, subjectBId));
    await db.delete(users).where(eq(users.id, studentId));
  });

  it("resolves the subject of the most recently completed attempt, whether it's a sub-topic or a paper", async () => {
    expect(await getMostRecentlyPracticedSubjectId(studentId, "10")).toBe(subjectBId);
  });

  it("returns null when the student has no completed attempts for that grade", async () => {
    expect(await getMostRecentlyPracticedSubjectId(studentId, "11")).toBeNull();
  });

  it("getOverallStats aggregates across every subject for the grade, not just one", async () => {
    // Both attempts are 1/1 correct (see beforeAll's answers), across two
    // different subjects — getOverallStats must combine both rather than
    // reflecting only whichever subject getProgressStats would be scoped to.
    const stats = await getOverallStats(studentId, "10");
    expect(stats.quizzesCompleted).toBe(2);
    expect(stats.totalQuestionsAnswered).toBe(2);
    expect(stats.totalCorrectAnswers).toBe(2);
    expect(stats.averageScore).toBe(100);
  });

  it("getOverallStats returns zeroed stats and a null average for a grade with no completed attempts", async () => {
    const stats = await getOverallStats(studentId, "11");
    expect(stats).toEqual({
      quizzesCompleted: 0,
      totalQuestionsAnswered: 0,
      totalCorrectAnswers: 0,
      averageScore: null,
    });
  });
});

// getSubjectAccuracyTrends backs the Dashboard's "Subject Performance"
// chart — real weekly-bucketed cumulative accuracy, not placeholder data.
// completedAt is backdated via a direct db.update after finalizing each
// attempt through the real quiz-taking API, since there's no way to submit
// an attempt "in the past" through the public functions.
describe("getSubjectAccuracyTrends", () => {
  const runId = randomUUID().slice(0, 8);
  const subjectName = `Test Trend Subject ${runId}`;
  let subjectId: string;
  let subTopicId: string;
  let mcq1Id: string;
  let mcq2Id: string;
  let otherGradeSubTopicId: string;
  let otherGradeMcqId: string;
  let studentId: string;

  beforeAll(async () => {
    const [subject] = await db.insert(subjects).values({ name: subjectName }).returning();
    subjectId = subject.id;

    const [testModule] = await db
      .insert(modules)
      .values({ subjectId, grade: "10", name: `Test Trend Module ${runId}`, sortOrder: 0 })
      .returning();
    const [subTopic] = await db
      .insert(subTopics)
      .values({ moduleId: testModule.id, name: `Test Trend Sub-topic ${runId}`, sortOrder: 0 })
      .returning();
    subTopicId = subTopic.id;

    const [mcq1] = await db
      .insert(mcqs)
      .values({ subTopicId, questionText: "Q1", options: textOptions("A", "B"), correctOption: 0, status: "published" })
      .returning({ id: mcqs.id });
    mcq1Id = mcq1.id;
    const [mcq2] = await db
      .insert(mcqs)
      .values({ subTopicId, questionText: "Q2", options: textOptions("A", "B"), correctOption: 0, status: "published" })
      .returning({ id: mcqs.id });
    mcq2Id = mcq2.id;

    const [otherGradeModule] = await db
      .insert(modules)
      .values({ subjectId, grade: "11", name: `Test Trend Other Grade Module ${runId}`, sortOrder: 0 })
      .returning();
    const [otherGradeSubTopic] = await db
      .insert(subTopics)
      .values({ moduleId: otherGradeModule.id, name: `Test Trend Other Grade Sub-topic ${runId}`, sortOrder: 0 })
      .returning();
    otherGradeSubTopicId = otherGradeSubTopic.id;
    const [otherGradeMcq] = await db
      .insert(mcqs)
      .values({
        subTopicId: otherGradeSubTopicId,
        questionText: "Q3",
        options: textOptions("A", "B"),
        correctOption: 0,
        status: "published",
      })
      .returning({ id: mcqs.id });
    otherGradeMcqId = otherGradeMcq.id;

    const [student] = await db
      .insert(users)
      .values({ authProviderId: `test-trend-auth-${runId}`, email: `test-trend-${runId}@example.com` })
      .returning();
    studentId = student.id;

    // Attempt 1: 1/2 correct, backdated to exactly 3 weeks before the
    // current ISO week's Monday, so it lands in a known bucket.
    const attempt1Id = await ensureSubTopicAttemptStarted(studentId, subTopicId);
    await saveQuizAnswer({ studentId, attemptId: attempt1Id, mcqId: mcq1Id, selectedOption: 0 }); // correct
    await saveQuizAnswer({ studentId, attemptId: attempt1Id, mcqId: mcq2Id, selectedOption: 1 }); // wrong
    await finalizeSubTopicAttempt({ studentId, attemptId: attempt1Id });

    const now = new Date();
    const daysSinceMonday = (now.getUTCDay() + 6) % 7;
    const thisWeekStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday),
    );
    const backdated = new Date(thisWeekStart);
    backdated.setUTCDate(backdated.getUTCDate() - 21);
    await db.update(quizAttempts).set({ completedAt: backdated }).where(eq(quizAttempts.id, attempt1Id));

    // Attempt 2 (a retake): 2/2 correct, completed "now" (this week).
    const attempt2Id = await ensureSubTopicAttemptStarted(studentId, subTopicId);
    await saveQuizAnswer({ studentId, attemptId: attempt2Id, mcqId: mcq1Id, selectedOption: 0 });
    await saveQuizAnswer({ studentId, attemptId: attempt2Id, mcqId: mcq2Id, selectedOption: 0 });
    await finalizeSubTopicAttempt({ studentId, attemptId: attempt2Id });

    // A grade-11 attempt for the same student/subject — must never leak
    // into the grade-10 trend's numbers.
    const otherGradeAttemptId = await ensureSubTopicAttemptStarted(studentId, otherGradeSubTopicId);
    await saveQuizAnswer({ studentId, attemptId: otherGradeAttemptId, mcqId: otherGradeMcqId, selectedOption: 0 });
    await finalizeSubTopicAttempt({ studentId, attemptId: otherGradeAttemptId });
  });

  afterAll(async () => {
    await db.delete(subjects).where(eq(subjects.id, subjectId));
    await db.delete(users).where(eq(users.id, studentId));
  });

  it("buckets into 7 weekly cumulative-to-date points: null before any data, then updating as attempts land", async () => {
    const trends = await getSubjectAccuracyTrends(studentId, "10");
    expect(trends).toHaveLength(1);
    const trend = trends[0];
    expect(trend.subjectName).toBe(subjectName);
    expect(trend.points).toHaveLength(7);

    // No data at all before attempt 1's week.
    expect(trend.points[0].accuracy).toBeNull();
    expect(trend.points[1].accuracy).toBeNull();
    expect(trend.points[2].accuracy).toBeNull();
    // Attempt 1 (1/2 = 50%) lands in week index 3 and carries forward.
    expect(trend.points[3].accuracy).toBe(50);
    expect(trend.points[4].accuracy).toBe(50);
    expect(trend.points[5].accuracy).toBe(50);
    // This week: attempt 2 lands too -> (1+2)/(2+2) = 75%. If the grade-11
    // attempt had leaked in, this would be 80% instead.
    expect(trend.points[6].accuracy).toBe(75);
  });

  it("scopes strictly by grade — the grade-11 attempt only shows up when querying grade 11", async () => {
    const grade11Trends = await getSubjectAccuracyTrends(studentId, "11");
    expect(grade11Trends).toHaveLength(1);
    expect(grade11Trends[0].subjectName).toBe(subjectName);
    expect(grade11Trends[0].points.at(-1)?.accuracy).toBe(100);
  });

  it("returns an empty list for a student with no completed attempts at all", async () => {
    const [student] = await db
      .insert(users)
      .values({ authProviderId: `test-trend-empty-${runId}`, email: `test-trend-empty-${runId}@example.com` })
      .returning();
    try {
      expect(await getSubjectAccuracyTrends(student.id, "10")).toEqual([]);
    } finally {
      await db.delete(users).where(eq(users.id, student.id));
    }
  });
});

// getTopicStatusesForGrade backs the Dashboard's "Topic Performance" card —
// confirms it rolls up to Topic (module), not sub-topic, rows: a topic with
// two attempted sub-topics (60% + 100%) reports the true combined
// aggregate, a not_started topic is still returned (score null, not
// omitted), and everything stays scoped to the requested grade/spans every
// subject. Mirrors getWeakTopicsForGrade's own fixture/aggregation style
// (tests/weak-areas.test.ts) minus the needs_work filter.
describe("getTopicStatusesForGrade", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectAId: string;
  let subjectBId: string;
  let moduleMixedId: string;
  let moduleUntouchedId: string;
  let moduleOtherSubjectId: string;
  let moduleGrade11Id: string;
  let studentId: string;

  beforeAll(async () => {
    const [subjectA] = await db.insert(subjects).values({ name: `Test TopicStatus Subject A ${runId}` }).returning();
    subjectAId = subjectA.id;
    const [subjectB] = await db.insert(subjects).values({ name: `Test TopicStatus Subject B ${runId}` }).returning();
    subjectBId = subjectB.id;

    const [moduleMixed] = await db
      .insert(modules)
      .values({ subjectId: subjectAId, grade: "10", name: `Mixed Module ${runId}`, sortOrder: 0 })
      .returning();
    moduleMixedId = moduleMixed.id;
    const [moduleUntouched] = await db
      .insert(modules)
      .values({ subjectId: subjectAId, grade: "10", name: `Untouched Module ${runId}`, sortOrder: 1 })
      .returning();
    moduleUntouchedId = moduleUntouched.id;
    const [moduleOtherSubject] = await db
      .insert(modules)
      .values({ subjectId: subjectBId, grade: "10", name: `Other Subject Module ${runId}`, sortOrder: 0 })
      .returning();
    moduleOtherSubjectId = moduleOtherSubject.id;
    const [moduleGrade11] = await db
      .insert(modules)
      .values({ subjectId: subjectAId, grade: "11", name: `Grade11 Module ${runId}`, sortOrder: 0 })
      .returning();
    moduleGrade11Id = moduleGrade11.id;

    const [subM] = await db.insert(subTopics).values({ moduleId: moduleMixedId, name: `M ${runId}`, sortOrder: 0 }).returning();
    const [subN] = await db.insert(subTopics).values({ moduleId: moduleMixedId, name: `N ${runId}`, sortOrder: 1 }).returning();
    await db.insert(subTopics).values({ moduleId: moduleUntouchedId, name: `Untouched ${runId}`, sortOrder: 0 });
    const [subO] = await db
      .insert(subTopics)
      .values({ moduleId: moduleOtherSubjectId, name: `O ${runId}`, sortOrder: 0 })
      .returning();
    const [subG11] = await db
      .insert(subTopics)
      .values({ moduleId: moduleGrade11Id, name: `G11 ${runId}`, sortOrder: 0 })
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

    const mMcqs = await makeMcqs(subM.id, 5);
    const nMcqs = await makeMcqs(subN.id, 5);
    const oMcqs = await makeMcqs(subO.id, 4);
    const g11Mcqs = await makeMcqs(subG11.id, 2);

    const [student] = await db
      .insert(users)
      .values({ authProviderId: `test-topicstatus-auth-${runId}`, email: `test-topicstatus-${runId}@example.com` })
      .returning();
    studentId = student.id;

    // M: 3/5 -> 60%. N: 5/5 -> 100%. Mixed Module true aggregate: 8/10 -> 80%.
    await submitFullSubTopicQuiz({
      studentId,
      subTopicId: subM.id,
      answers: Object.fromEntries(mMcqs.map((id, i) => [id, i < 3 ? 0 : 1])),
    });
    await submitFullSubTopicQuiz({
      studentId,
      subTopicId: subN.id,
      answers: Object.fromEntries(nMcqs.map((id) => [id, 0])),
    });
    // O (Subject B): 1/4 -> 25%.
    await submitFullSubTopicQuiz({
      studentId,
      subTopicId: subO.id,
      answers: Object.fromEntries(oMcqs.map((id, i) => [id, i === 0 ? 0 : 1])),
    });
    // G11 (Grade 11): must not appear when querying Grade 10.
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
  });

  it("rolls up a topic's own numbers across every sub-topic it contains, not just one", async () => {
    const topics = await getTopicStatusesForGrade(studentId, "10");
    const mixed = topics.find((t) => t.id === moduleMixedId)!;

    expect(mixed.questionsAnswered).toBe(10);
    expect(mixed.correctCount).toBe(8);
    expect(mixed.score).toBeCloseTo(80, 1);
    expect(mixed.label).toBe("mastered");
    expect(mixed.subTopics).toHaveLength(2);
  });

  it("still returns a never-attempted topic, with a null score rather than omitting it", async () => {
    const topics = await getTopicStatusesForGrade(studentId, "10");
    const untouched = topics.find((t) => t.id === moduleUntouchedId);
    expect(untouched).toBeDefined();
    expect(untouched!.score).toBeNull();
    expect(untouched!.label).toBe("not_started");
    expect(untouched!.questionsAnswered).toBe(0);
  });

  it("spans every subject for the grade and carries the correct subjectId/subjectName", async () => {
    const topics = await getTopicStatusesForGrade(studentId, "10");
    const otherSubject = topics.find((t) => t.id === moduleOtherSubjectId);
    expect(otherSubject).toBeDefined();
    expect(otherSubject!.subjectId).toBe(subjectBId);
    expect(otherSubject!.score).toBeCloseTo(25, 1);

    const mixed = topics.find((t) => t.id === moduleMixedId)!;
    expect(mixed.subjectId).toBe(subjectAId);
  });

  it("excludes a different grade's topic", async () => {
    const topics = await getTopicStatusesForGrade(studentId, "10");
    expect(topics.some((t) => t.id === moduleGrade11Id)).toBe(false);
  });
});

// A single file-level pool.end(), run once after every describe above has
// finished, rather than inside any one describe's own afterAll — this file
// now has two describes that hit the database, and closing the pool inside
// the first one's afterAll would break the second's beforeAll.
afterAll(async () => {
  await pool.end();
});
