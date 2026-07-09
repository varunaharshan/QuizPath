import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { mcqs, modules, papers, quizAttempts, subjects, subTopics, users } from "@/db/schema";
import { ensurePaperAttemptStarted } from "@/lib/quiz";
import {
  gceGradeForScore,
  getCompletedQuizzes,
  getMostRecentlyPracticedSubjectId,
  getOverallStats,
  getPaperAccuracyTrend,
  getTopicStatusesForGrade,
} from "@/lib/dashboard";
import { submitFullPaperQuiz, submitFullSubTopicQuiz, textOptions } from "./helpers";

// The "Your subjects" switcher's grade badge — a direct, unweighted G.C.E.
// O/L band mapping of a subject's own Score %. Boundaries matter here (a
// score exactly on a band edge belongs to the higher band).
describe("gceGradeForScore", () => {
  it("maps each band's lower boundary and a mid-band value correctly", () => {
    expect(gceGradeForScore(100)).toBe("A");
    expect(gceGradeForScore(75)).toBe("A");
    expect(gceGradeForScore(74.99)).toBe("B");
    expect(gceGradeForScore(70)).toBe("B");
    expect(gceGradeForScore(65)).toBe("B");
    expect(gceGradeForScore(64.99)).toBe("C");
    expect(gceGradeForScore(57)).toBe("C");
    expect(gceGradeForScore(50)).toBe("C");
    expect(gceGradeForScore(49.99)).toBe("S");
    expect(gceGradeForScore(42)).toBe("S");
    expect(gceGradeForScore(35)).toBe("S");
    expect(gceGradeForScore(34.99)).toBe("W");
    expect(gceGradeForScore(0)).toBe("W");
  });
});

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

  it("getOverallStats scopes to the requested subject and counts only paper attempts", async () => {
    // Subject B's attempt is a paper (1/1 correct) — scoping to it counts it.
    const subjectBStats = await getOverallStats(studentId, "10", subjectBId);
    expect(subjectBStats.quizzesCompleted).toBe(1);
    expect(subjectBStats.totalQuestionsAnswered).toBe(1);
    expect(subjectBStats.totalCorrectAnswers).toBe(1);
    expect(subjectBStats.averageScore).toBe(100);

    // Subject A's only attempt is a sub-topic (practice) attempt, not a
    // paper — scoping to subject A returns zero, proving both the subject
    // filter and the paper-only restriction (this isn't just "wrong
    // subject", it's "no paper attempts for this subject at all").
    const subjectAStats = await getOverallStats(studentId, "10", subjectAId);
    expect(subjectAStats.quizzesCompleted).toBe(0);
  });

  it("getCompletedQuizzes scopes to the requested subject", async () => {
    const subjectBPapers = await getCompletedQuizzes(studentId, { grade: "10", type: "paper", subjectId: subjectBId });
    expect(subjectBPapers.map((q) => q.title)).toEqual([`Test MostRecent Paper B ${runId}`]);

    // Subject A has no paper attempts at all.
    const subjectAPapers = await getCompletedQuizzes(studentId, { grade: "10", type: "paper", subjectId: subjectAId });
    expect(subjectAPapers).toEqual([]);

    // But subject A's own practice attempt is found when scoped correctly.
    const subjectAPractices = await getCompletedQuizzes(studentId, {
      grade: "10",
      type: "topic_practice",
      subjectId: subjectAId,
    });
    expect(subjectAPractices.map((q) => q.title)).toEqual([`Test MostRecent Sub-topic A ${runId}`]);
  });

  it("getOverallStats returns zeroed stats and a null average for a grade/subject with no completed attempts", async () => {
    const stats = await getOverallStats(studentId, "11", subjectBId);
    expect(stats).toEqual({
      quizzesCompleted: 0,
      totalQuestionsAnswered: 0,
      totalCorrectAnswers: 0,
      averageScore: null,
    });
  });
});

// getPaperAccuracyTrend backs the Dashboard's "Subject Performance" chart —
// one point per completed PAPER attempt (never a practice-session/sub-topic
// attempt), plotted at its own score, in chronological order — not a
// weekly-bucketed cumulative average. completedAt is backdated via a direct
// db.update after finalizing each attempt through the real quiz-taking API,
// since there's no way to submit an attempt "in the past" through the
// public functions.
describe("getPaperAccuracyTrend", () => {
  const runId = randomUUID().slice(0, 8);
  const subjectName = `Test Trend Subject ${runId}`;
  let subjectId: string;
  let paperAId: string;
  let paperBId: string;
  let subTopicId: string;
  let otherGradePaperId: string;
  let studentId: string;

  beforeAll(async () => {
    const [subject] = await db.insert(subjects).values({ name: subjectName }).returning();
    subjectId = subject.id;

    const [paperA] = await db
      .insert(papers)
      .values({
        subjectId,
        grade: "10",
        medium: "english",
        paperType: "provincial",
        title: `Test Trend Paper A ${runId}`,
        status: "published",
      })
      .returning();
    paperAId = paperA.id;
    const [paperB] = await db
      .insert(papers)
      .values({
        subjectId,
        grade: "10",
        medium: "english",
        paperType: "district",
        title: `Test Trend Paper B ${runId}`,
        status: "published",
      })
      .returning();
    paperBId = paperB.id;

    const [testModule] = await db
      .insert(modules)
      .values({ subjectId, grade: "10", name: `Test Trend Module ${runId}`, sortOrder: 0 })
      .returning();
    const [subTopic] = await db
      .insert(subTopics)
      .values({ moduleId: testModule.id, name: `Test Trend Sub-topic ${runId}`, sortOrder: 0 })
      .returning();
    subTopicId = subTopic.id;

    const [paperAMcq1] = await db
      .insert(mcqs)
      .values({ paperId: paperAId, questionText: "PA-Q1", options: textOptions("A", "B"), correctOption: 0, status: "published" })
      .returning({ id: mcqs.id });
    const [paperAMcq2] = await db
      .insert(mcqs)
      .values({ paperId: paperAId, questionText: "PA-Q2", options: textOptions("A", "B"), correctOption: 0, status: "published" })
      .returning({ id: mcqs.id });
    const [paperBMcq] = await db
      .insert(mcqs)
      .values({ paperId: paperBId, questionText: "PB-Q1", options: textOptions("A", "B"), correctOption: 0, status: "published" })
      .returning({ id: mcqs.id });
    const [practiceMcq] = await db
      .insert(mcqs)
      .values({ subTopicId, questionText: "Practice-Q1", options: textOptions("A", "B"), correctOption: 0, status: "published" })
      .returning({ id: mcqs.id });

    const [otherGradePaper] = await db
      .insert(papers)
      .values({
        subjectId,
        grade: "11",
        medium: "english",
        paperType: "provincial",
        title: `Test Trend Other Grade Paper ${runId}`,
        status: "published",
      })
      .returning();
    otherGradePaperId = otherGradePaper.id;
    const [otherGradeMcq] = await db
      .insert(mcqs)
      .values({
        paperId: otherGradePaperId,
        questionText: "OG-Q1",
        options: textOptions("A", "B"),
        correctOption: 0,
        status: "published",
      })
      .returning({ id: mcqs.id });

    const [student] = await db
      .insert(users)
      .values({ authProviderId: `test-trend-auth-${runId}`, email: `test-trend-${runId}@example.com` })
      .returning();
    studentId = student.id;

    // Paper A: 1/2 correct (50%), backdated to 2 days ago -> should sort first.
    const resultA = await submitFullPaperQuiz({
      studentId,
      paperId: paperAId,
      answers: { [paperAMcq1.id]: 0, [paperAMcq2.id]: 1 },
    });
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await db.update(quizAttempts).set({ completedAt: twoDaysAgo }).where(eq(quizAttempts.id, resultA.attemptId));

    // Paper B: 1/1 correct (100%), completed "now" -> should sort second.
    await submitFullPaperQuiz({ studentId, paperId: paperBId, answers: { [paperBMcq.id]: 0 } });

    // A practice (sub-topic) attempt for the same subject/grade — must never
    // appear in the paper-only trend at all.
    await submitFullSubTopicQuiz({ studentId, subTopicId, answers: { [practiceMcq.id]: 0 } });

    // A grade-11 paper attempt for the same student/subject — must never
    // leak into the grade-10 trend.
    await submitFullPaperQuiz({ studentId, paperId: otherGradePaperId, answers: { [otherGradeMcq.id]: 0 } });
  });

  afterAll(async () => {
    await db.delete(subjects).where(eq(subjects.id, subjectId));
    await db.delete(users).where(eq(users.id, studentId));
  });

  it("returns one point per completed paper attempt, chronological, each showing that attempt's own score", async () => {
    const trends = await getPaperAccuracyTrend(studentId, "10");
    expect(trends).toHaveLength(1);
    const trend = trends[0];
    expect(trend.subjectName).toBe(subjectName);
    expect(trend.points).toHaveLength(2);

    // Paper A (50%, backdated) comes before Paper B (100%, now) — not a
    // weekly cumulative average, and not leaking the practice attempt in.
    expect(trend.points[0].score).toBe(50);
    expect(trend.points[1].score).toBe(100);
    expect(trend.points[0].completedAt.getTime()).toBeLessThan(trend.points[1].completedAt.getTime());
  });

  it("scopes strictly by grade — the grade-11 paper attempt only shows up when querying grade 11", async () => {
    const grade11Trends = await getPaperAccuracyTrend(studentId, "11");
    expect(grade11Trends).toHaveLength(1);
    expect(grade11Trends[0].subjectName).toBe(subjectName);
    expect(grade11Trends[0].points).toHaveLength(1);
    expect(grade11Trends[0].points[0].score).toBe(100);
  });

  it("returns a single point for a subject with just one paper attempt, not padded or omitted", async () => {
    const grade11Trends = await getPaperAccuracyTrend(studentId, "11");
    expect(grade11Trends[0].points).toHaveLength(1);
  });

  it("returns an empty list for a student with no completed paper attempts at all", async () => {
    const [student] = await db
      .insert(users)
      .values({ authProviderId: `test-trend-empty-${runId}`, email: `test-trend-empty-${runId}@example.com` })
      .returning();
    try {
      expect(await getPaperAccuracyTrend(student.id, "10")).toEqual([]);
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
