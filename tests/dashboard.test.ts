import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { mcqs, modules, papers, quizAttempts, subjects, subTopics, users } from "@/db/schema";
import { ensurePaperAttemptStarted, ensureSubTopicAttemptStarted, saveQuizAnswer } from "@/lib/quiz";
import {
  getCompletedQuizzes,
  getContinueAttempt,
  rankRecommendedPracticeTopics,
  type TopicProgress,
} from "@/lib/dashboard";
import { submitFullSubTopicQuiz } from "./helpers";

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
  let grade10SubTopic2Id: string;
  let grade11SubTopicId: string;
  let grade10McqIds: string[];
  let grade11McqIds: string[];
  let grade10SubTopic2McqId: string;
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

    const [grade10SubTopic2] = await db
      .insert(subTopics)
      .values({ moduleId: grade10ModuleId, name: `Test Dashboard Sub-topic 10b ${runId}`, sortOrder: 1 })
      .returning();
    grade10SubTopic2Id = grade10SubTopic2.id;

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

    const [grade10SubTopic2Mcq] = await db
      .insert(mcqs)
      .values({ subTopicId: grade10SubTopic2Id, questionText: "3 + 3 = ?", options: ["5", "6", "7"], correctOption: 1, status: "published" })
      .returning({ id: mcqs.id });
    grade10SubTopic2McqId = grade10SubTopic2Mcq.id;

    const grade11Inserted = await db
      .insert(mcqs)
      .values([
        { subTopicId: grade11SubTopicId, questionText: "2 + 2 = ?", options: ["3", "4", "5"], correctOption: 1, status: "published" },
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
    await pool.end();
  });

  it("getContinueAttempt picks the most recently started in-progress paper for the requested grade", async () => {
    const grade10Continue = await getContinueAttempt(studentId, "10");
    expect(grade10Continue?.type).toBe("paper");
    expect(grade10Continue?.id).toBe(grade10PaperBId); // B started after A

    const grade11Continue = await getContinueAttempt(studentId, "11");
    expect(grade11Continue?.type).toBe("paper");
    expect(grade11Continue?.id).toBe(otherGradePaperId);
  });

  it("getContinueAttempt picks up an in-progress topic-practice attempt too, regardless of type, when it's the most recent", async () => {
    // Sub-topic quizzes now have real start/resume semantics (mirroring
    // papers), so an in-progress row can be produced through the actual
    // public API rather than needing a raw insert.
    const attemptId = await ensureSubTopicAttemptStarted(studentId, grade10SubTopic2Id);

    let grade10Continue = await getContinueAttempt(studentId, "10");
    expect(grade10Continue?.type).toBe("topic_practice");
    expect(grade10Continue?.id).toBe(grade10SubTopic2Id);
    expect(grade10Continue?.source).toBe("Practice quiz");
    expect(grade10Continue?.questionsDone).toBe(0);

    // Saving an answer incrementally must be reflected live in questionsDone
    // — this is what lets the Dashboard show real "X of Y done" progress.
    await saveQuizAnswer({
      studentId,
      attemptId,
      mcqId: grade10SubTopic2McqId,
      selectedOption: 1,
    });
    grade10Continue = await getContinueAttempt(studentId, "10");
    expect(grade10Continue?.questionsDone).toBe(1);

    await db.delete(quizAttempts).where(eq(quizAttempts.id, attemptId));
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
});

describe("rankRecommendedPracticeTopics", () => {
  function topic(overrides: Partial<TopicProgress>): TopicProgress {
    return {
      id: randomUUID(),
      name: "Topic",
      questionsAnswered: 0,
      correctCount: 0,
      score: null,
      label: "not_started",
      ...overrides,
    };
  }

  it("prioritizes the 40-59% band (closest to crossing 60%) over lower scores and not-started topics", () => {
    const closeToThreshold = topic({ name: "Close", score: 55, label: "needs_work" });
    const veryWeak = topic({ name: "VeryWeak", score: 10, label: "needs_work" });
    const notStarted = topic({ name: "NotStarted", score: null, label: "not_started" });
    const mastered = topic({ name: "Mastered", score: 95, label: "mastered" });
    const inProgress = topic({ name: "InProgress", score: 70, label: "in_progress" });

    const ranked = rankRecommendedPracticeTopics(
      [notStarted, veryWeak, mastered, inProgress, closeToThreshold],
      2,
    );

    // mastered/in_progress excluded entirely; closeToThreshold (40-59%) beats
    // veryWeak (<40%) beats notStarted (last).
    expect(ranked.map((t) => t.name)).toEqual(["Close", "VeryWeak"]);
  });

  it("within the 40-59% band, ranks closer to 60% first (descending)", () => {
    const t42 = topic({ name: "42", score: 42, label: "needs_work" });
    const t58 = topic({ name: "58", score: 58, label: "needs_work" });
    const t50 = topic({ name: "50", score: 50, label: "needs_work" });

    const ranked = rankRecommendedPracticeTopics([t42, t58, t50], 3);
    expect(ranked.map((t) => t.name)).toEqual(["58", "50", "42"]);
  });

  it("below 40%, ranks lowest score first (most urgent)", () => {
    const t35 = topic({ name: "35", score: 35, label: "needs_work" });
    const t5 = topic({ name: "5", score: 5, label: "needs_work" });
    const t20 = topic({ name: "20", score: 20, label: "needs_work" });

    const ranked = rankRecommendedPracticeTopics([t35, t5, t20], 3);
    expect(ranked.map((t) => t.name)).toEqual(["5", "20", "35"]);
  });

  it("ranks not-started topics last even when there are fewer than `limit` scored weak topics", () => {
    const oneWeak = topic({ name: "Weak", score: 45, label: "needs_work" });
    const notStarted1 = topic({ name: "NotStarted1", score: null, label: "not_started" });
    const notStarted2 = topic({ name: "NotStarted2", score: null, label: "not_started" });

    const ranked = rankRecommendedPracticeTopics([notStarted1, notStarted2, oneWeak], 2);
    expect(ranked.map((t) => t.name)).toEqual(["Weak", "NotStarted1"]);
  });
});
