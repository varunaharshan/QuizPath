import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { mcqs, modules, papers, subjects, subTopics, users } from "@/db/schema";
import { getProgressStats, getSubTopicStatusesForGrade, isProgressStatsEmpty } from "@/lib/dashboard";
import { submitFullPaperQuiz, submitFullSubTopicQuiz, textOptions } from "./helpers";

// Confirms the Progress tab's Grade + Subject scoping and the KPI/topic-table
// math: a student can view progress for their own grade or a different one
// they've practiced (same free-browsing rule as Practice), each grade's
// numbers are never blended with another grade's, topic-level results never
// leak in from a different subject, the KPI cards are cumulative counts (not
// an average of each attempt's own percentage), and the topic table lists
// one row per Topic (module) — never a bare sub-topic as its own top-level
// row — with each topic's own numbers a rollup across its sub-topics, and
// the individual sub-topics available on that row's own `subTopics` array
// for the drill-down.
describe("Progress tab: Grade + Subject scoping and KPI math", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectAId: string;
  let subjectBId: string;
  let studentId: string;

  // Subject A, Grade 10: ONE topic (module) with three sub-topics in
  // syllabus order (sortOrder 0/1/2), whose scores are deliberately NOT
  // monotonic with that order, so a test asserting "returned in sortOrder"
  // can't accidentally pass because it also happens to match a
  // score-sorted order. This is also the fixture that proves the
  // topic-level rollup: three sub-topics' answers must all roll up into
  // exactly one topic row, not three.
  let moduleA10Id: string;
  let subTopicXId: string; // sortOrder 0, 1/2 correct -> 50% (needs_work)
  let subTopicYId: string; // sortOrder 1, 9/10 correct -> 90% (mastered)
  let subTopicZId: string; // sortOrder 2, 0/3 correct -> 0% (needs_work)
  // Subject A, Grade 11: the student's own profile grade — one topic, one sub-topic.
  let moduleA11Id: string;
  let subTopicA3Id: string; // needs_work, 50%
  // Subject B, Grade 10: must never appear in Subject A's Grade 10 view.
  let moduleB10Id: string;
  let subTopicB1Id: string; // needs_work, 0%
  // Subject B, Grade 11: exists but never attempted -> the empty-state case.
  let moduleB11Id: string;
  let subTopicB2Id: string;

  beforeAll(async () => {
    const [subjectA] = await db
      .insert(subjects)
      .values({ name: `Test Progress Subject A ${runId}` })
      .returning();
    subjectAId = subjectA.id;

    const [subjectB] = await db
      .insert(subjects)
      .values({ name: `Test Progress Subject B ${runId}` })
      .returning();
    subjectBId = subjectB.id;

    const [moduleA10] = await db
      .insert(modules)
      .values({ subjectId: subjectAId, grade: "10", name: `A10 Module ${runId}`, sortOrder: 0 })
      .returning();
    moduleA10Id = moduleA10.id;
    const [moduleA11] = await db
      .insert(modules)
      .values({ subjectId: subjectAId, grade: "11", name: `A11 Module ${runId}`, sortOrder: 0 })
      .returning();
    moduleA11Id = moduleA11.id;
    const [moduleB10] = await db
      .insert(modules)
      .values({ subjectId: subjectBId, grade: "10", name: `B10 Module ${runId}`, sortOrder: 0 })
      .returning();
    moduleB10Id = moduleB10.id;
    const [moduleB11] = await db
      .insert(modules)
      .values({ subjectId: subjectBId, grade: "11", name: `B11 Module ${runId}`, sortOrder: 0 })
      .returning();
    moduleB11Id = moduleB11.id;

    const [subTopicX] = await db
      .insert(subTopics)
      .values({ moduleId: moduleA10.id, name: `X Topic ${runId}`, sortOrder: 0 })
      .returning();
    subTopicXId = subTopicX.id;
    const [subTopicY] = await db
      .insert(subTopics)
      .values({ moduleId: moduleA10.id, name: `Y Topic ${runId}`, sortOrder: 1 })
      .returning();
    subTopicYId = subTopicY.id;
    const [subTopicZ] = await db
      .insert(subTopics)
      .values({ moduleId: moduleA10.id, name: `Z Topic ${runId}`, sortOrder: 2 })
      .returning();
    subTopicZId = subTopicZ.id;
    const [subTopicA3] = await db
      .insert(subTopics)
      .values({ moduleId: moduleA11.id, name: `A3 Grade11 Topic ${runId}`, sortOrder: 0 })
      .returning();
    subTopicA3Id = subTopicA3.id;
    const [subTopicB1] = await db
      .insert(subTopics)
      .values({ moduleId: moduleB10.id, name: `B1 Other Subject Topic ${runId}`, sortOrder: 0 })
      .returning();
    subTopicB1Id = subTopicB1.id;
    const [subTopicB2] = await db
      .insert(subTopics)
      .values({ moduleId: moduleB11.id, name: `B2 Untouched Topic ${runId}`, sortOrder: 0 })
      .returning();
    subTopicB2Id = subTopicB2.id;

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

    const xMcqs = await makeMcqs(subTopicXId, 2);
    const yMcqs = await makeMcqs(subTopicYId, 10);
    const zMcqs = await makeMcqs(subTopicZId, 3);
    const a3Mcqs = await makeMcqs(subTopicA3Id, 2);
    const b1Mcqs = await makeMcqs(subTopicB1Id, 1);
    await makeMcqs(subTopicB2Id, 1); // never attempted

    const [student] = await db
      .insert(users)
      .values({ authProviderId: `test-progress-auth-${runId}`, email: `test-progress-${runId}@example.com` })
      .returning();
    studentId = student.id;

    // X: 1 of 2 correct -> 50% (needs_work).
    await submitFullSubTopicQuiz({
      studentId,
      subTopicId: subTopicXId,
      answers: { [xMcqs[0]]: 0, [xMcqs[1]]: 1 },
    });
    // Y: 9 of 10 correct -> 90% (mastered).
    await submitFullSubTopicQuiz({
      studentId,
      subTopicId: subTopicYId,
      answers: Object.fromEntries(yMcqs.map((id, i) => [id, i === 9 ? 1 : 0])),
    });
    // Z: 0 of 3 correct -> 0% (needs_work).
    await submitFullSubTopicQuiz({
      studentId,
      subTopicId: subTopicZId,
      answers: Object.fromEntries(zMcqs.map((id) => [id, 1])),
    });
    // A3 (Grade 11, the student's own profile grade): 1 of 2 -> 50% (needs_work).
    await submitFullSubTopicQuiz({
      studentId,
      subTopicId: subTopicA3Id,
      answers: { [a3Mcqs[0]]: 0, [a3Mcqs[1]]: 1 },
    });
    // B1 (a different subject, same Grade 10): 0 of 1 -> 0% (needs_work).
    // Must never surface in Subject A's Grade 10 progress view.
    await submitFullSubTopicQuiz({
      studentId,
      subTopicId: subTopicB1Id,
      answers: { [b1Mcqs[0]]: 1 },
    });
  });

  afterAll(async () => {
    await db.delete(subjects).where(eq(subjects.id, subjectAId));
    await db.delete(subjects).where(eq(subjects.id, subjectBId));
    await db.delete(users).where(eq(users.id, studentId));
  });

  it("shows progress for the student's own grade (11), scoped to Subject A only, with one topic row (not a bare sub-topic row)", async () => {
    const stats = await getProgressStats(studentId, "11", subjectAId);

    expect(stats.quizzesCompleted).toBe(1);
    expect(stats.totalQuestionsAnswered).toBe(2);
    expect(stats.totalCorrectAnswers).toBe(1);
    expect(stats.averageScore).toBeCloseTo(50, 1);
    expect(stats.topics).toHaveLength(1);
    expect(stats.topics[0].id).toBe(moduleA11Id);
    expect(stats.topics[0].label).toBe("needs_work");
    expect(stats.topics[0].questionsAnswered).toBe(2);
    expect(stats.topics[0].correctCount).toBe(1);
    // The drill-down exposes the sub-topic, but it's never itself a
    // top-level row.
    expect(stats.topics[0].subTopics).toHaveLength(1);
    expect(stats.topics[0].subTopics[0].id).toBe(subTopicA3Id);
    expect(stats.topics.map((t) => t.id)).not.toContain(subTopicA3Id);
  });

  it("computes KPI cards as cumulative totals, not an average of each attempt's own percentage", async () => {
    const stats = await getProgressStats(studentId, "10", subjectAId);

    // X: 1/2, Y: 9/10, Z: 0/3 -> cumulative 10 correct of 15 total = 66.67%.
    // A naive per-attempt average of (50 + 90 + 0) / 3 = 46.67% would be wrong
    // — it weights Z's 3-question attempt the same as Y's 10-question one.
    expect(stats.quizzesCompleted).toBe(3);
    expect(stats.totalQuestionsAnswered).toBe(15);
    expect(stats.totalCorrectAnswers).toBe(10);
    expect(stats.averageScore).toBeCloseTo(66.67, 1);
  });

  it("rolls up three sub-topics into exactly one topic row, aggregating without double-counting", async () => {
    const stats = await getProgressStats(studentId, "10", subjectAId);

    // One topic row for the whole grade+subject here, not three — X, Y, Z
    // all belong to the same module.
    expect(stats.topics).toHaveLength(1);
    const topic = stats.topics[0];
    expect(topic.id).toBe(moduleA10Id);

    // The rollup: 15 answered, 10 correct across X+Y+Z combined -> 66.67%,
    // which lands in "in_progress" (60-79), distinct from any individual
    // sub-topic's own label below.
    expect(topic.questionsAnswered).toBe(15);
    expect(topic.correctCount).toBe(10);
    expect(topic.score).toBeCloseTo(66.67, 1);
    expect(topic.label).toBe("in_progress");

    // The drill-down lists every sub-topic in syllabus order (sortOrder),
    // including the mastered one — not sorted by score — each scored on
    // its own, independent of the topic's own rolled-up label.
    expect(topic.subTopics.map((s) => s.id)).toEqual([subTopicXId, subTopicYId, subTopicZId]);
    expect(topic.subTopics.map((s) => s.label)).toEqual(["needs_work", "mastered", "needs_work"]);
    expect(topic.subTopics.map((s) => s.questionsAnswered)).toEqual([2, 10, 3]);
    expect(topic.subTopics.map((s) => s.correctCount)).toEqual([1, 9, 0]);

    // None of the three sub-topics ever appear as their own top-level row.
    expect(stats.topics.map((t) => t.id)).not.toEqual(
      expect.arrayContaining([subTopicXId, subTopicYId, subTopicZId]),
    );
  });

  it("never bleeds in topics (or their sub-topics) from a different subject at the same grade", async () => {
    const stats = await getProgressStats(studentId, "10", subjectAId);
    expect(stats.topics.some((t) => t.id === moduleB10Id)).toBe(false);
    expect(stats.topics.some((t) => t.subTopics.some((s) => s.id === subTopicB1Id))).toBe(false);

    // Confirmed independently via the underlying status query too.
    const statuses = await getSubTopicStatusesForGrade(studentId, "10", subjectAId);
    expect(statuses.some((s) => s.id === subTopicB1Id)).toBe(false);
  });

  it("reports zero attempts for a Grade + Subject the student hasn't touched (empty state), with the untouched topic scored null not 0", async () => {
    const stats = await getProgressStats(studentId, "11", subjectBId);
    expect(stats.quizzesCompleted).toBe(0);
    expect(stats.totalQuestionsAnswered).toBe(0);
    expect(stats.totalCorrectAnswers).toBe(0);
    expect(stats.averageScore).toBeNull();
    // The topic still exists (and is listed as not_started, score null, not
    // 0%) — the empty state is driven by zero attempts, not by zero topics
    // existing.
    expect(stats.topics).toHaveLength(1);
    expect(stats.topics[0].id).toBe(moduleB11Id);
    expect(stats.topics[0].label).toBe("not_started");
    expect(stats.topics[0].score).toBeNull();
    expect(stats.topics[0].questionsAnswered).toBe(0);
    expect(stats.topics[0].correctCount).toBe(0);
    expect(stats.topics[0].subTopics).toHaveLength(1);
    expect(stats.topics[0].subTopics[0].id).toBe(subTopicB2Id);
    expect(stats.topics[0].subTopics[0].score).toBeNull();
  });
});

// GCSE represents the combined Grade 10 + Grade 11 syllabus, not its own
// taxonomy — a "gcse" request unions both grades' own modules (see
// moduleGradesForQuery). This is also the key reconciliation case: a paper
// genuinely tagged "gcse" whose questions are split across a Grade 10 and a
// Grade 11 sub-topic must have quizzesCompleted/totalQuestionsAnswered
// (paper-grade-based) and the topics breakdown (module-grade-based) agree —
// previously, for an ordinary single-grade-tagged paper with mixed-grade
// questions, these two numbers could silently disagree (see CLAUDE.md "GCSE
// / combined-grade topic queries").
describe("Progress tab: GCSE (combined Grade 10 + Grade 11) topic queries", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectId: string;
  let module10Id: string;
  let module11Id: string;
  let subTopic10Id: string;
  let subTopic11Id: string;
  let studentId: string;

  beforeAll(async () => {
    const [subject] = await db.insert(subjects).values({ name: `Test GCSE Progress Subject ${runId}` }).returning();
    subjectId = subject.id;

    const [module10] = await db
      .insert(modules)
      .values({ subjectId, grade: "10", name: `GCSE G10 Module ${runId}`, sortOrder: 0 })
      .returning();
    module10Id = module10.id;
    const [module11] = await db
      .insert(modules)
      .values({ subjectId, grade: "11", name: `GCSE G11 Module ${runId}`, sortOrder: 0 })
      .returning();
    module11Id = module11.id;

    const [subTopic10] = await db
      .insert(subTopics)
      .values({ moduleId: module10Id, name: `GCSE G10 Sub-topic ${runId}`, sortOrder: 0 })
      .returning();
    subTopic10Id = subTopic10.id;
    const [subTopic11] = await db
      .insert(subTopics)
      .values({ moduleId: module11Id, name: `GCSE G11 Sub-topic ${runId}`, sortOrder: 0 })
      .returning();
    subTopic11Id = subTopic11.id;

    // A single real paper, tagged grade="gcse" directly — its questions still
    // point at real Grade 10/Grade 11 sub-topics via sub_topic_id, exactly as
    // the design calls for (no GCSE-owned taxonomy).
    const [gcsePaper] = await db
      .insert(papers)
      .values({
        subjectId,
        grade: "gcse",
        medium: "english",
        paperType: "provincial",
        title: `Test GCSE Paper ${runId}`,
        status: "published",
      })
      .returning();

    const g10Mcqs = await db
      .insert(mcqs)
      .values([
        { paperId: gcsePaper.id, subTopicId: subTopic10Id, questionText: "G10 Q1", options: textOptions("A", "B"), correctOption: 0, status: "published" },
        { paperId: gcsePaper.id, subTopicId: subTopic10Id, questionText: "G10 Q2", options: textOptions("A", "B"), correctOption: 0, status: "published" },
      ])
      .returning({ id: mcqs.id });
    const g11Mcqs = await db
      .insert(mcqs)
      .values([
        { paperId: gcsePaper.id, subTopicId: subTopic11Id, questionText: "G11 Q1", options: textOptions("A", "B"), correctOption: 0, status: "published" },
        { paperId: gcsePaper.id, subTopicId: subTopic11Id, questionText: "G11 Q2", options: textOptions("A", "B"), correctOption: 0, status: "published" },
      ])
      .returning({ id: mcqs.id });

    const [student] = await db
      .insert(users)
      .values({ authProviderId: `test-gcse-progress-auth-${runId}`, email: `test-gcse-progress-${runId}@example.com` })
      .returning();
    studentId = student.id;

    // 3 of 4 correct: both G10 questions right, one of two G11 questions right.
    await submitFullPaperQuiz({
      studentId,
      paperId: gcsePaper.id,
      answers: {
        [g10Mcqs[0].id]: 0,
        [g10Mcqs[1].id]: 0,
        [g11Mcqs[0].id]: 0,
        [g11Mcqs[1].id]: 1,
      },
    });
  });

  afterAll(async () => {
    await db.delete(subjects).where(eq(subjects.id, subjectId));
    await db.delete(users).where(eq(users.id, studentId));
  });

  it("unions Grade 10 and Grade 11 modules into the topics breakdown, grouped by grade", async () => {
    const stats = await getProgressStats(studentId, "gcse", subjectId);

    expect(stats.topics.map((t) => t.id)).toEqual([module10Id, module11Id]);
  });

  it("reconciles quizzesCompleted/totalQuestionsAnswered with the topics breakdown for a genuine GCSE paper attempt", async () => {
    const stats = await getProgressStats(studentId, "gcse", subjectId);

    // The paper attempt itself counts via the exact "gcse" match...
    expect(stats.quizzesCompleted).toBe(1);
    expect(stats.totalQuestionsAnswered).toBe(4);
    expect(stats.totalCorrectAnswers).toBe(3);

    // ...and every one of those 4 answers now has a home in the topics
    // breakdown too, because the module-side filter spans both grades the
    // paper's questions are actually tagged under. No silent shortfall.
    const summedAnswered = stats.topics.reduce((sum, t) => sum + t.questionsAnswered, 0);
    const summedCorrect = stats.topics.reduce((sum, t) => sum + t.correctCount, 0);
    expect(summedAnswered).toBe(stats.totalQuestionsAnswered);
    expect(summedCorrect).toBe(stats.totalCorrectAnswers);

    const g10Topic = stats.topics.find((t) => t.id === module10Id)!;
    const g11Topic = stats.topics.find((t) => t.id === module11Id)!;
    expect(g10Topic.questionsAnswered).toBe(2);
    expect(g10Topic.correctCount).toBe(2);
    expect(g11Topic.questionsAnswered).toBe(2);
    expect(g11Topic.correctCount).toBe(1);
  });

  it("getSubTopicStatusesForGrade also unions both grades for 'gcse'", async () => {
    const statuses = await getSubTopicStatusesForGrade(studentId, "gcse", subjectId);
    expect(statuses.map((s) => s.id).sort()).toEqual([subTopic10Id, subTopic11Id].sort());
  });

  it("an ordinary single-grade request is unaffected — only 'gcse' unions", async () => {
    const grade10Only = await getProgressStats(studentId, "10", subjectId);
    expect(grade10Only.topics.map((t) => t.id)).toEqual([module10Id]);
    expect(grade10Only.quizzesCompleted).toBe(0); // the paper is tagged "gcse", not "10"

    const grade11Only = await getProgressStats(studentId, "11", subjectId);
    expect(grade11Only.topics.map((t) => t.id)).toEqual([module11Id]);
    expect(grade11Only.quizzesCompleted).toBe(0);
  });
});

// The Grade 11 "Include Grade 10 foundational topics" toggle — an explicit,
// opt-in override (withGrade10Toggle), distinct from "gcse" above:
// moduleGradesForQuery itself is untouched, so grade "11" still resolves to
// just ["11"] unless a caller explicitly passes includeGrade10: true. This
// is also the key reconciliation case instruction #2 asked to be walked
// through, not assumed: with the toggle on, a Grade 10 module's own topic
// row folds in a Grade 10 PAPER attempt's answers too (topic-level mastery
// is always the true cumulative total for that sub-topic, source-agnostic),
// even though that same paper attempt is deliberately excluded from
// quizzesCompleted (the paper-side condition never widens — a Grade 10
// paper must not count as a "Grade 11 quiz completed"). That's a real,
// accepted divergence from GCSE's tighter reconciliation guarantee: the
// summed `topics` total can exceed totalQuestionsAnswered once the toggle
// is on. See CLAUDE.md and getProgressStats' own comment.
describe("Progress tab: Grade 11 'Include Grade 10' toggle", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectId: string;
  let moduleC10Id: string;
  let moduleC11Id: string;
  let subTopicC10aId: string; // Grade 10, practice-attempted: 1/2
  let subTopicC10bId: string; // Grade 10, paper-attempted (a Grade 10 paper): 1/1
  let subTopicC11aId: string; // Grade 11, paper-attempted (a Grade 11 paper): 2/2
  let studentId: string;
  let studentGrade10PaperOnlyId: string;

  beforeAll(async () => {
    const [subject] = await db.insert(subjects).values({ name: `Test Grade11Toggle Subject ${runId}` }).returning();
    subjectId = subject.id;

    const [moduleC10] = await db
      .insert(modules)
      .values({ subjectId, grade: "10", name: `Toggle G10 Module ${runId}`, sortOrder: 0 })
      .returning();
    moduleC10Id = moduleC10.id;
    const [moduleC11] = await db
      .insert(modules)
      .values({ subjectId, grade: "11", name: `Toggle G11 Module ${runId}`, sortOrder: 0 })
      .returning();
    moduleC11Id = moduleC11.id;

    const [subTopicC10a] = await db
      .insert(subTopics)
      .values({ moduleId: moduleC10Id, name: `Toggle G10a Sub-topic ${runId}`, sortOrder: 0 })
      .returning();
    subTopicC10aId = subTopicC10a.id;
    const [subTopicC10b] = await db
      .insert(subTopics)
      .values({ moduleId: moduleC10Id, name: `Toggle G10b Sub-topic ${runId}`, sortOrder: 1 })
      .returning();
    subTopicC10bId = subTopicC10b.id;
    const [subTopicC11a] = await db
      .insert(subTopics)
      .values({ moduleId: moduleC11Id, name: `Toggle G11a Sub-topic ${runId}`, sortOrder: 0 })
      .returning();
    subTopicC11aId = subTopicC11a.id;

    const [paperG10] = await db
      .insert(papers)
      .values({
        subjectId,
        grade: "10",
        medium: "english",
        paperType: "provincial",
        title: `Test Toggle Grade10 Paper ${runId}`,
        status: "published",
      })
      .returning();
    const [paperG11] = await db
      .insert(papers)
      .values({
        subjectId,
        grade: "11",
        medium: "english",
        paperType: "provincial",
        title: `Test Toggle Grade11 Paper ${runId}`,
        status: "published",
      })
      .returning();

    const [practiceMcq1, practiceMcq2] = await db
      .insert(mcqs)
      .values([
        { subTopicId: subTopicC10aId, questionText: "C10a Q1", options: textOptions("A", "B"), correctOption: 0, status: "published" },
        { subTopicId: subTopicC10aId, questionText: "C10a Q2", options: textOptions("A", "B"), correctOption: 0, status: "published" },
      ])
      .returning();
    const [g10PaperMcq] = await db
      .insert(mcqs)
      .values([
        { paperId: paperG10.id, subTopicId: subTopicC10bId, questionText: "G10 Paper Q1", options: textOptions("A", "B"), correctOption: 0, status: "published" },
      ])
      .returning();
    const [g11PaperMcq1, g11PaperMcq2] = await db
      .insert(mcqs)
      .values([
        { paperId: paperG11.id, subTopicId: subTopicC11aId, questionText: "G11 Paper Q1", options: textOptions("A", "B"), correctOption: 0, status: "published" },
        { paperId: paperG11.id, subTopicId: subTopicC11aId, questionText: "G11 Paper Q2", options: textOptions("A", "B"), correctOption: 0, status: "published" },
      ])
      .returning();

    const [student] = await db
      .insert(users)
      .values({ authProviderId: `test-g11toggle-auth-${runId}`, email: `test-g11toggle-${runId}@example.com` })
      .returning();
    studentId = student.id;

    // C10a: standalone sub-topic practice attempt, 1 of 2 correct.
    await submitFullSubTopicQuiz({
      studentId,
      subTopicId: subTopicC10aId,
      answers: { [practiceMcq1.id]: 0, [practiceMcq2.id]: 1 },
    });
    // The Grade 10 paper: 1 of 1 correct.
    await submitFullPaperQuiz({ studentId, paperId: paperG10.id, answers: { [g10PaperMcq.id]: 0 } });
    // The Grade 11 paper: 2 of 2 correct.
    await submitFullPaperQuiz({
      studentId,
      paperId: paperG11.id,
      answers: { [g11PaperMcq1.id]: 0, [g11PaperMcq2.id]: 0 },
    });

    // A second student who has ONLY completed the Grade 10 paper — no
    // standalone Grade 10 practice attempt, no Grade 11 history at all.
    // Isolates the isProgressStatsEmpty edge case: quizzesCompleted stays 0
    // for this student even with the toggle on (the paper-side condition
    // never widens), while the topics breakdown has real data once widened.
    const [studentGrade10PaperOnly] = await db
      .insert(users)
      .values({
        authProviderId: `test-g11toggle-paperonly-auth-${runId}`,
        email: `test-g11toggle-paperonly-${runId}@example.com`,
      })
      .returning();
    studentGrade10PaperOnlyId = studentGrade10PaperOnly.id;
    await submitFullPaperQuiz({
      studentId: studentGrade10PaperOnlyId,
      paperId: paperG10.id,
      answers: { [g10PaperMcq.id]: 0 },
    });
  });

  afterAll(async () => {
    await db.delete(subjects).where(eq(subjects.id, subjectId));
    await db.delete(users).where(eq(users.id, studentId));
    await db.delete(users).where(eq(users.id, studentGrade10PaperOnlyId));
  });

  it("includeGrade10 defaults to false — byte-for-byte the same as omitting it", async () => {
    const withoutArg = await getProgressStats(studentId, "11", subjectId);
    const withFalse = await getProgressStats(studentId, "11", subjectId, false);
    expect(withFalse).toEqual(withoutArg);

    expect(withoutArg.topics.map((t) => t.id)).toEqual([moduleC11Id]);
    expect(withoutArg.quizzesCompleted).toBe(1); // only the Grade 11 paper attempt
    expect(withoutArg.totalQuestionsAnswered).toBe(2);
    expect(withoutArg.totalCorrectAnswers).toBe(2);
  });

  it("includeGrade10: true unions in the Grade 10 module, grouped by grade, each topic carrying its own grade", async () => {
    const stats = await getProgressStats(studentId, "11", subjectId, true);

    expect(stats.topics.map((t) => t.id)).toEqual([moduleC10Id, moduleC11Id]);
    expect(stats.topics.find((t) => t.id === moduleC10Id)!.grade).toBe("10");
    expect(stats.topics.find((t) => t.id === moduleC11Id)!.grade).toBe("11");
  });

  it("widens quizzesCompleted's module side for a Grade 10 practice attempt, but never the paper side for a Grade 10 paper", async () => {
    const stats = await getProgressStats(studentId, "11", subjectId, true);

    // Counts: the Grade 10 practice attempt (module-side, now widened) and
    // the Grade 11 paper attempt (paper-side, exact match) — NOT the Grade
    // 10 paper attempt, which matches neither branch.
    expect(stats.quizzesCompleted).toBe(2);
    expect(stats.totalQuestionsAnswered).toBe(4); // 2 (practice) + 2 (Grade 11 paper)
    expect(stats.totalCorrectAnswers).toBe(3); // 1 (practice) + 2 (Grade 11 paper)
  });

  it("the topics breakdown can exceed quizzesCompleted's totals once the toggle is on — the Grade 10 paper's answer still has a home in its topic row", async () => {
    const stats = await getProgressStats(studentId, "11", subjectId, true);

    const g10Topic = stats.topics.find((t) => t.id === moduleC10Id)!;
    // C10a (practice, 2 answered/1 correct) + C10b (the Grade 10 PAPER, 1
    // answered/1 correct) both roll up here — topic-level mastery is always
    // the true cumulative total for a sub-topic, regardless of source.
    expect(g10Topic.questionsAnswered).toBe(3);
    expect(g10Topic.correctCount).toBe(2);

    const g11Topic = stats.topics.find((t) => t.id === moduleC11Id)!;
    expect(g11Topic.questionsAnswered).toBe(2);
    expect(g11Topic.correctCount).toBe(2);

    const summedAnswered = stats.topics.reduce((sum, t) => sum + t.questionsAnswered, 0);
    const summedCorrect = stats.topics.reduce((sum, t) => sum + t.correctCount, 0);
    // 5 summed vs. 4 in totalQuestionsAnswered — the Grade 10 paper's
    // question is counted here but not in quizzesCompleted's own total.
    expect(summedAnswered).toBe(5);
    expect(summedAnswered).toBeGreaterThan(stats.totalQuestionsAnswered);
    expect(summedCorrect).toBe(4);
    expect(summedCorrect).toBeGreaterThan(stats.totalCorrectAnswers);
  });

  it("isProgressStatsEmpty: a student whose only Grade 10 exposure was a Grade 10 paper reads as empty when the toggle is off, but not once it's on", async () => {
    const statsOff = await getProgressStats(studentGrade10PaperOnlyId, "11", subjectId, false);
    expect(statsOff.quizzesCompleted).toBe(0);
    expect(isProgressStatsEmpty(statsOff, false)).toBe(true);

    const statsOn = await getProgressStats(studentGrade10PaperOnlyId, "11", subjectId, true);
    // quizzesCompleted stays 0 — the Grade 10 paper attempt never matches
    // either branch of the attempts query, toggle or not.
    expect(statsOn.quizzesCompleted).toBe(0);
    // But the widened topics breakdown has real data (the Grade 10 paper's
    // own question, tagged to subTopicC10b), so the empty-state gate must
    // not fire once the toggle reveals it.
    expect(statsOn.topics.find((t) => t.id === moduleC10Id)!.questionsAnswered).toBe(1);
    expect(isProgressStatsEmpty(statsOn, true)).toBe(false);
  });
});

afterAll(async () => {
  await pool.end();
});
