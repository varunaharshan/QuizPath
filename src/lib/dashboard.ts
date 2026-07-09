import { and, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  masteryScores,
  mcqs,
  modules,
  papers,
  quizAttemptAnswers,
  quizAttempts,
  subjects,
  subTopics,
} from "@/db/schema";
import { masteryLabelForScore, type MasteryLabel } from "./quiz";

export type SubTopicStatusLabel = MasteryLabel | "not_started";

export type SubTopicStatus = {
  id: string;
  name: string;
  moduleName: string;
  // Every module belongs to exactly one subject (modules.subject_id is
  // NOT NULL), so these are always populated — added for Weak Areas'
  // subject-grouped tiles (src/lib/practice.ts groupWeakAreasBySubject),
  // which need a subject identity per row that moduleName alone can't give.
  subjectId: string;
  subjectName: string;
  score: number | null;
  label: SubTopicStatusLabel;
  questionsAnswered: number;
};

// One row per sub-topic for the student's grade (optionally narrowed to one
// subject), joined with their mastery score if they've attempted it. Backs
// the dashboard's progress card, the practice list, the sidebar's practice
// count, and the Progress tab's topic breakdown. `subjectId` is optional —
// every existing caller wants "every subject for this grade" (there's only
// Science today, but the practice-count badge etc. are deliberately
// grade-wide, not subject-scoped); the Progress tab is the one caller that
// narrows to a specific subject.
export async function getSubTopicStatusesForGrade(
  studentId: string,
  grade: "10" | "11",
  subjectId?: string,
): Promise<SubTopicStatus[]> {
  const gradeModules = await db.query.modules.findMany({
    where: subjectId ? and(eq(modules.grade, grade), eq(modules.subjectId, subjectId)) : eq(modules.grade, grade),
    orderBy: modules.sortOrder,
    with: { subTopics: { orderBy: subTopics.sortOrder }, subject: true },
  });

  const scores = await db
    .select()
    .from(masteryScores)
    .where(eq(masteryScores.studentId, studentId));
  const scoreBySubTopic = new Map(
    scores.map((s) => [s.subTopicId, { score: Number(s.score), questionsAnswered: s.questionsAnswered }]),
  );

  const statuses: SubTopicStatus[] = [];
  for (const gradeModule of gradeModules) {
    for (const subTopic of gradeModule.subTopics) {
      const mastery = scoreBySubTopic.get(subTopic.id);
      statuses.push({
        id: subTopic.id,
        name: subTopic.name,
        moduleName: gradeModule.name,
        subjectId: gradeModule.subject.id,
        subjectName: gradeModule.subject.name,
        score: mastery?.score ?? null,
        label: mastery ? masteryLabelForScore(mastery.score) : "not_started",
        questionsAnswered: mastery?.questionsAnswered ?? 0,
      });
    }
  }
  return statuses;
}

export type CompletedQuiz = {
  attemptId: string;
  title: string;
  // Lets callers label a row by its source (e.g. Dashboard's "Recent
  // activity" prefixes topic-practice rows with "Practice: ", papers just
  // show their own title) — formatting stays in the page, not baked into
  // `title` itself.
  type: "paper" | "topic_practice";
  completedAt: Date;
  correctCount: number;
  total: number;
  // Wall-clock time between starting and completing the attempt, in
  // minutes — NOT a measure of active study time. Save-and-resume lets a
  // student start an attempt, close the tab, and finish it days later;
  // that gap counts here too, since quiz_attempts has no separate "time
  // actively engaged" tracking. Shown as a best-effort "Time" column on the
  // Dashboard's Recent Test Activity table with that caveat in mind.
  durationMinutes: number;
};

// Every completed attempt, sub-topic or paper — resolves whichever title
// applies rather than reconciling the two into one tracking model. `grade`
// is optional: the Dashboard's history table passes the student's own grade
// (so an attempt from browsing another grade's papers in Practice doesn't
// show up there), while other pages only need the overall "has this student
// completed anything, ever" count (the "Active learner" pill) and call this
// without a grade filter.
export async function getCompletedQuizzes(
  studentId: string,
  options: { grade?: "10" | "11"; limit?: number } = {},
): Promise<CompletedQuiz[]> {
  const { grade, limit = 20 } = options;

  const attempts = await db
    .select({
      id: quizAttempts.id,
      subTopicId: quizAttempts.subTopicId,
      paperId: quizAttempts.paperId,
      startedAt: quizAttempts.startedAt,
      completedAt: quizAttempts.completedAt,
    })
    .from(quizAttempts)
    .leftJoin(subTopics, eq(subTopics.id, quizAttempts.subTopicId))
    .leftJoin(modules, eq(modules.id, subTopics.moduleId))
    .leftJoin(papers, eq(papers.id, quizAttempts.paperId))
    .where(
      and(
        eq(quizAttempts.studentId, studentId),
        isNotNull(quizAttempts.completedAt),
        grade ? or(eq(modules.grade, grade), eq(papers.grade, grade)) : undefined,
      ),
    )
    .orderBy(desc(quizAttempts.completedAt))
    .limit(limit);

  if (attempts.length === 0) return [];

  const attemptIds = attempts.map((a) => a.id);
  const answers = await db
    .select({
      quizAttemptId: quizAttemptAnswers.quizAttemptId,
      isCorrect: quizAttemptAnswers.isCorrect,
    })
    .from(quizAttemptAnswers)
    .where(inArray(quizAttemptAnswers.quizAttemptId, attemptIds));

  const countsByAttempt = new Map<string, { correct: number; total: number }>();
  for (const answer of answers) {
    const counts = countsByAttempt.get(answer.quizAttemptId) ?? { correct: 0, total: 0 };
    counts.total += 1;
    if (answer.isCorrect) counts.correct += 1;
    countsByAttempt.set(answer.quizAttemptId, counts);
  }

  const subTopicIds = [...new Set(attempts.map((a) => a.subTopicId).filter((id) => id !== null))];
  const subTopicRows = subTopicIds.length
    ? await db.select({ id: subTopics.id, name: subTopics.name }).from(subTopics).where(inArray(subTopics.id, subTopicIds))
    : [];
  const subTopicNameById = new Map(subTopicRows.map((s) => [s.id, s.name]));

  const paperIds = [...new Set(attempts.map((a) => a.paperId).filter((id) => id !== null))];
  const paperRows = paperIds.length
    ? await db.select({ id: papers.id, title: papers.title }).from(papers).where(inArray(papers.id, paperIds))
    : [];
  const paperTitleById = new Map(paperRows.map((p) => [p.id, p.title]));

  return attempts.map((attempt) => {
    const counts = countsByAttempt.get(attempt.id) ?? { correct: 0, total: 0 };
    const title = attempt.subTopicId
      ? (subTopicNameById.get(attempt.subTopicId) ?? "Unknown sub-topic")
      : (paperTitleById.get(attempt.paperId!) ?? "Unknown paper");
    return {
      attemptId: attempt.id,
      title,
      type: attempt.subTopicId ? "topic_practice" : "paper",
      completedAt: attempt.completedAt!,
      correctCount: counts.correct,
      total: counts.total,
      durationMinutes: Math.max(0, Math.round((attempt.completedAt!.getTime() - attempt.startedAt.getTime()) / 60000)),
    };
  });
}

// Practice by Topic defaults its subject tab to whichever subject the
// student most recently completed a quiz in (paper or sub-topic, for this
// grade) — falling back to the first subject (the page's own responsibility,
// not this function's) when there's no completed-attempt history yet.
// Mirrors getContinueAttempt's join shape (leftJoin subTopics/modules/papers,
// or(modules.grade, papers.grade)) since it needs the same "resolve subject
// regardless of paper vs topic-practice" logic, just for the most recent
// *completed* attempt instead of the most recent *incomplete* one.
export async function getMostRecentlyPracticedSubjectId(
  studentId: string,
  grade: "10" | "11",
): Promise<string | null> {
  const [row] = await db
    .select({ subTopicSubjectId: modules.subjectId, paperSubjectId: papers.subjectId })
    .from(quizAttempts)
    .leftJoin(subTopics, eq(subTopics.id, quizAttempts.subTopicId))
    .leftJoin(modules, eq(modules.id, subTopics.moduleId))
    .leftJoin(papers, eq(papers.id, quizAttempts.paperId))
    .where(
      and(
        eq(quizAttempts.studentId, studentId),
        isNotNull(quizAttempts.completedAt),
        or(eq(modules.grade, grade), eq(papers.grade, grade)),
      ),
    )
    .orderBy(desc(quizAttempts.completedAt))
    .limit(1);

  return row?.subTopicSubjectId ?? row?.paperSubjectId ?? null;
}

export type SubTopicProgress = {
  id: string;
  name: string;
  questionsAnswered: number;
  correctCount: number;
  score: number | null; // null (not 0) when questionsAnswered is 0 — "not started", not "0%".
  label: SubTopicStatusLabel;
};

export type TopicProgress = SubTopicProgress & {
  // Every sub-topic under this topic (module), in syllabus sortOrder — for
  // the Progress tab's expandable per-topic drill-down. A question with no
  // sub_topic_id has no topic association at all in this schema (mcqs has
  // no module/topic FK of its own, only subTopicId), so there's no
  // "untagged" bucket to add here — every question this topic's own
  // questionsAnswered/correctCount could possibly include already belongs
  // to exactly one of these sub-topics.
  subTopics: SubTopicProgress[];
};

export type ProgressStats = {
  quizzesCompleted: number;
  totalQuestionsAnswered: number;
  totalCorrectAnswers: number;
  averageScore: number | null;
  // One row per Topic (module) for this grade+subject, in syllabus order
  // (module sortOrder) — never a bare sub-topic as its own top-level row.
  // Each topic's own numbers are a rollup across every sub-topic it
  // contains; see `subTopics` on each row for the per-sub-topic breakdown.
  topics: TopicProgress[];
};

function scoreAndLabel(counts: { questionsAnswered: number; correctCount: number }): {
  score: number | null;
  label: SubTopicStatusLabel;
} {
  const score =
    counts.questionsAnswered === 0
      ? null
      : Math.round((counts.correctCount / counts.questionsAnswered) * 10000) / 100;
  return { score, label: score === null ? "not_started" : masteryLabelForScore(score) };
}

// Powers the Progress tab's per-Grade+Subject topic breakdown. Deliberately
// scoped to one grade *and* one subject at a time — there's no cross-grade
// "exam readiness" aggregation or blended score here; a student viewing
// Grade 11 progress sees only Grade 11 numbers, never combined with Grade 10.
//
// The 4 KPI cards are cumulative counts across every completed attempt that
// belongs to this grade+subject (via the sub-topic's module, or the paper's
// own grade/subject) — `averageScore` is total correct ÷ total questions
// answered, deliberately NOT an average of each attempt's own percentage
// (that would weight a 2-question attempt the same as a 40-question one,
// double-counting the smaller sample).
//
// Each sub-topic's questionsAnswered/correctCount is computed live from
// quiz_attempt_answers (the same source of truth
// recalculateMasteryForSubTopic writes from), rather than read out of the
// mastery_scores cache — this table needs an exact raw "Correct" count
// alongside the percentage, and re-deriving an integer count from a
// already-rounded stored percentage risks an off-by-one in the displayed
// math. Each topic's own numbers are then just a rollup of its own
// sub-topics' already-correct counts — since every sub-topic belongs to
// exactly one topic, summing them up can't double-count or drop anything
// relative to the per-sub-topic numbers already being computed.
export async function getProgressStats(
  studentId: string,
  grade: "10" | "11",
  subjectId: string,
): Promise<ProgressStats> {
  const gradeModules = await db.query.modules.findMany({
    where: and(eq(modules.grade, grade), eq(modules.subjectId, subjectId)),
    orderBy: modules.sortOrder,
    with: { subTopics: { orderBy: subTopics.sortOrder } },
  });
  const subTopicIds = gradeModules.flatMap((m) => m.subTopics.map((s) => s.id));

  const topicAnswerRows = subTopicIds.length
    ? await db
        .select({ subTopicId: mcqs.subTopicId, isCorrect: quizAttemptAnswers.isCorrect })
        .from(quizAttemptAnswers)
        .innerJoin(mcqs, eq(mcqs.id, quizAttemptAnswers.mcqId))
        .innerJoin(quizAttempts, eq(quizAttempts.id, quizAttemptAnswers.quizAttemptId))
        .where(
          and(
            eq(quizAttempts.studentId, studentId),
            isNotNull(quizAttempts.completedAt),
            inArray(mcqs.subTopicId, subTopicIds),
          ),
        )
    : [];

  const countsBySubTopic = new Map<string, { questionsAnswered: number; correctCount: number }>();
  for (const row of topicAnswerRows) {
    if (!row.subTopicId) continue;
    const counts = countsBySubTopic.get(row.subTopicId) ?? { questionsAnswered: 0, correctCount: 0 };
    counts.questionsAnswered += 1;
    if (row.isCorrect) counts.correctCount += 1;
    countsBySubTopic.set(row.subTopicId, counts);
  }

  const topics: TopicProgress[] = gradeModules.map((gradeModule) => {
    const subTopicRows: SubTopicProgress[] = gradeModule.subTopics.map((subTopic) => {
      const counts = countsBySubTopic.get(subTopic.id) ?? { questionsAnswered: 0, correctCount: 0 };
      return { id: subTopic.id, name: subTopic.name, ...counts, ...scoreAndLabel(counts) };
    });

    const topicCounts = {
      questionsAnswered: subTopicRows.reduce((sum, s) => sum + s.questionsAnswered, 0),
      correctCount: subTopicRows.reduce((sum, s) => sum + s.correctCount, 0),
    };

    return {
      id: gradeModule.id,
      name: gradeModule.name,
      ...topicCounts,
      ...scoreAndLabel(topicCounts),
      subTopics: subTopicRows,
    };
  });

  const attempts = await db
    .select({ id: quizAttempts.id })
    .from(quizAttempts)
    .leftJoin(subTopics, eq(subTopics.id, quizAttempts.subTopicId))
    .leftJoin(modules, eq(modules.id, subTopics.moduleId))
    .leftJoin(papers, eq(papers.id, quizAttempts.paperId))
    .where(
      and(
        eq(quizAttempts.studentId, studentId),
        isNotNull(quizAttempts.completedAt),
        or(
          and(eq(modules.grade, grade), eq(modules.subjectId, subjectId)),
          and(eq(papers.grade, grade), eq(papers.subjectId, subjectId)),
        ),
      ),
    );

  const quizzesCompleted = attempts.length;
  let totalQuestionsAnswered = 0;
  let totalCorrectAnswers = 0;

  if (quizzesCompleted > 0) {
    const attemptIds = attempts.map((a) => a.id);
    const allAnswers = await db
      .select({ isCorrect: quizAttemptAnswers.isCorrect })
      .from(quizAttemptAnswers)
      .where(inArray(quizAttemptAnswers.quizAttemptId, attemptIds));
    totalQuestionsAnswered = allAnswers.length;
    totalCorrectAnswers = allAnswers.filter((a) => a.isCorrect).length;
  }

  const averageScore =
    totalQuestionsAnswered === 0
      ? null
      : Math.round((totalCorrectAnswers / totalQuestionsAnswered) * 10000) / 100;

  return { quizzesCompleted, totalQuestionsAnswered, totalCorrectAnswers, averageScore, topics };
}

// Powers the Weak Areas page's topic-primary list — mirrors getProgressStats's
// rollup shape (TopicProgress/SubTopicProgress, the shared scoreAndLabel
// helper) but reads from the mastery_scores cache instead of live
// quiz_attempt_answers, matching getSubTopicStatusesForGrade's existing data
// source (this function is grade-wide, deliberately not accepting a
// subjectId, since Weak Areas surfaces the single weakest topic first
// regardless of subject). mastery_scores has no raw correctCount column,
// only score (%) and questionsAnswered, so each sub-topic's correctCount is
// reconstructed as round(score/100 * questionsAnswered) before summing —
// exact in practice for realistic question counts, though not a
// byte-for-byte guarantee the way a live count is. This cache can also lag
// briefly behind live data in one narrow case: an admin reassigning a
// question's sub_topic_id or deleting a historically-answered question
// doesn't trigger a recalculation, so a stale number can persist until the
// student's next completed attempt in that sub-topic — a pre-existing
// property of every getSubTopicStatusesForGrade consumer, not something
// this function introduces.
//
// Inclusion is driven entirely by individual sub-topics, not the topic's
// own rolled-up score: a topic appears here if and only if at least one of
// its sub-topics is itself needs_work (score < 60%, attempted). A topic
// sitting at 85% overall still shows up if one sub-topic is individually
// weak — the topic's own aggregate is irrelevant to inclusion. `subTopics`
// on each returned topic is filtered down to only that weak slice (never
// attempted sub-topics, and sub-topics scoring >= 60%, are both omitted —
// "no data" isn't weakness, and a fine sub-topic isn't what this page is
// for) — but the topic row's own questionsAnswered/correctCount/score/label
// still reflect its TRUE full aggregate across every sub-topic, including
// the ones hidden from the list, so a student sees "this topic's fine
// overall, but here's the specific pocket dragging on it." Sorted ascending
// by that true aggregate score — weakest topic first.
export async function getWeakTopicsForGrade(studentId: string, grade: "10" | "11"): Promise<TopicProgress[]> {
  const gradeModules = await db.query.modules.findMany({
    where: eq(modules.grade, grade),
    orderBy: modules.sortOrder,
    with: { subTopics: { orderBy: subTopics.sortOrder } },
  });

  const scores = await db.select().from(masteryScores).where(eq(masteryScores.studentId, studentId));
  const scoreBySubTopic = new Map(
    scores.map((s) => [s.subTopicId, { score: Number(s.score), questionsAnswered: s.questionsAnswered }]),
  );

  const topics: TopicProgress[] = [];
  for (const gradeModule of gradeModules) {
    const allSubTopicRows: SubTopicProgress[] = gradeModule.subTopics.map((subTopic) => {
      const mastery = scoreBySubTopic.get(subTopic.id);
      const questionsAnswered = mastery?.questionsAnswered ?? 0;
      const score = mastery?.score ?? null;
      const correctCount = mastery ? Math.round((mastery.score / 100) * questionsAnswered) : 0;
      return {
        id: subTopic.id,
        name: subTopic.name,
        questionsAnswered,
        correctCount,
        score,
        label: score === null ? "not_started" : masteryLabelForScore(score),
      };
    });

    const weakSubTopicRows = allSubTopicRows.filter((s) => s.label === "needs_work");
    if (weakSubTopicRows.length === 0) continue;

    const questionsAnswered = allSubTopicRows.reduce((sum, s) => sum + s.questionsAnswered, 0);
    const correctCount = allSubTopicRows.reduce((sum, s) => sum + s.correctCount, 0);
    const { score, label } = scoreAndLabel({ questionsAnswered, correctCount });

    topics.push({
      id: gradeModule.id,
      name: gradeModule.name,
      questionsAnswered,
      correctCount,
      score,
      label,
      subTopics: weakSubTopicRows,
    });
  }

  return topics.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
}

export type OverallStats = {
  quizzesCompleted: number;
  totalQuestionsAnswered: number;
  totalCorrectAnswers: number;
  averageScore: number | null;
};

// Account-wide (every subject, not just one) cumulative stats for the
// Dashboard's restyled stat row — sits above a per-subject breakdown rather
// than being scoped to one subject itself, unlike getProgressStats (which
// is deliberately grade+subject scoped, for the Progress tab, and is left
// untouched here). Mirrors getProgressStats's own aggregation approach
// (cumulative correct/total across every completed attempt for the grade)
// just without a subject filter.
export async function getOverallStats(studentId: string, grade: "10" | "11"): Promise<OverallStats> {
  const attempts = await db
    .select({ id: quizAttempts.id })
    .from(quizAttempts)
    .leftJoin(subTopics, eq(subTopics.id, quizAttempts.subTopicId))
    .leftJoin(modules, eq(modules.id, subTopics.moduleId))
    .leftJoin(papers, eq(papers.id, quizAttempts.paperId))
    .where(
      and(
        eq(quizAttempts.studentId, studentId),
        isNotNull(quizAttempts.completedAt),
        or(eq(modules.grade, grade), eq(papers.grade, grade)),
      ),
    );

  const quizzesCompleted = attempts.length;
  let totalQuestionsAnswered = 0;
  let totalCorrectAnswers = 0;

  if (quizzesCompleted > 0) {
    const attemptIds = attempts.map((a) => a.id);
    const allAnswers = await db
      .select({ isCorrect: quizAttemptAnswers.isCorrect })
      .from(quizAttemptAnswers)
      .where(inArray(quizAttemptAnswers.quizAttemptId, attemptIds));
    totalQuestionsAnswered = allAnswers.length;
    totalCorrectAnswers = allAnswers.filter((a) => a.isCorrect).length;
  }

  const averageScore =
    totalQuestionsAnswered === 0 ? null : Math.round((totalCorrectAnswers / totalQuestionsAnswered) * 10000) / 100;

  return { quizzesCompleted, totalQuestionsAnswered, totalCorrectAnswers, averageScore };
}

function startOfWeekUTC(date: Date): Date {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = start.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (day + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}

function addDaysUTC(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

const TREND_WEEKS = 7;

export type SubjectAccuracyPoint = {
  weekStart: Date;
  // Cumulative-to-date accuracy as of the end of this week — null when the
  // student has no completed attempts in this subject yet at all (never 0%,
  // matching this app's usual "no data yet" vs "scored zero" distinction).
  accuracy: number | null;
};

export type SubjectAccuracyTrend = {
  subjectId: string;
  subjectName: string;
  points: SubjectAccuracyPoint[];
};

// Real historical accuracy trend per subject for the Dashboard's "Subject
// Performance" chart — the raw data (quiz_attempts.completedAt +
// quiz_attempt_answers) already exists, but no prior aggregation bucketed
// it over time (every other stat in this app is a single cumulative
// total-to-date, not a series), so this is new: weekly (Monday-start UTC)
// buckets over the last TREND_WEEKS weeks, one series per subject that has
// at least one completed attempt in this grade. Each point is CUMULATIVE
// accuracy up to the end of that week (a running "how has my overall
// accuracy evolved" line), not that week's accuracy in isolation — a
// single quiet or unlucky week can't make the trend swing wildly, which
// matters given a student may only have a handful of attempts total.
// Subjects are resolved via two separate queries (sub-topic attempts via
// their module, paper attempts via the paper itself) and merged in JS,
// mirroring getCompletedQuizzes's existing approach — simpler than a
// single query needing the subjects table joined in twice.
export async function getSubjectAccuracyTrends(studentId: string, grade: "10" | "11"): Promise<SubjectAccuracyTrend[]> {
  const subTopicAttempts = await db
    .select({
      id: quizAttempts.id,
      completedAt: quizAttempts.completedAt,
      subjectId: modules.subjectId,
      subjectName: subjects.name,
    })
    .from(quizAttempts)
    .innerJoin(subTopics, eq(subTopics.id, quizAttempts.subTopicId))
    .innerJoin(modules, eq(modules.id, subTopics.moduleId))
    .innerJoin(subjects, eq(subjects.id, modules.subjectId))
    .where(
      and(eq(quizAttempts.studentId, studentId), eq(modules.grade, grade), isNotNull(quizAttempts.completedAt)),
    );

  const paperAttempts = await db
    .select({
      id: quizAttempts.id,
      completedAt: quizAttempts.completedAt,
      subjectId: papers.subjectId,
      subjectName: subjects.name,
    })
    .from(quizAttempts)
    .innerJoin(papers, eq(papers.id, quizAttempts.paperId))
    .innerJoin(subjects, eq(subjects.id, papers.subjectId))
    .where(and(eq(quizAttempts.studentId, studentId), eq(papers.grade, grade), isNotNull(quizAttempts.completedAt)));

  const allAttempts = [...subTopicAttempts, ...paperAttempts];
  if (allAttempts.length === 0) return [];

  const attemptIds = allAttempts.map((a) => a.id);
  const answers = await db
    .select({ quizAttemptId: quizAttemptAnswers.quizAttemptId, isCorrect: quizAttemptAnswers.isCorrect })
    .from(quizAttemptAnswers)
    .where(inArray(quizAttemptAnswers.quizAttemptId, attemptIds));

  const countsByAttempt = new Map<string, { correct: number; total: number }>();
  for (const answer of answers) {
    const counts = countsByAttempt.get(answer.quizAttemptId) ?? { correct: 0, total: 0 };
    counts.total += 1;
    if (answer.isCorrect) counts.correct += 1;
    countsByAttempt.set(answer.quizAttemptId, counts);
  }

  const bySubject = new Map<
    string,
    { subjectName: string; attempts: { completedAt: Date; correct: number; total: number }[] }
  >();
  for (const attempt of allAttempts) {
    if (!attempt.completedAt) continue;
    const counts = countsByAttempt.get(attempt.id) ?? { correct: 0, total: 0 };
    const entry = { completedAt: attempt.completedAt, correct: counts.correct, total: counts.total };
    const group = bySubject.get(attempt.subjectId);
    if (group) group.attempts.push(entry);
    else bySubject.set(attempt.subjectId, { subjectName: attempt.subjectName, attempts: [entry] });
  }

  const thisWeekStart = startOfWeekUTC(new Date());
  const weekStarts: Date[] = [];
  for (let i = TREND_WEEKS - 1; i >= 0; i--) {
    weekStarts.push(addDaysUTC(thisWeekStart, -7 * i));
  }

  const trends: SubjectAccuracyTrend[] = [];
  for (const [subjectId, { subjectName, attempts }] of bySubject) {
    const points: SubjectAccuracyPoint[] = weekStarts.map((weekStart) => {
      const cutoff = addDaysUTC(weekStart, 7);
      const upToDate = attempts.filter((a) => a.completedAt < cutoff);
      const correct = upToDate.reduce((sum, a) => sum + a.correct, 0);
      const total = upToDate.reduce((sum, a) => sum + a.total, 0);
      return {
        weekStart,
        accuracy: total === 0 ? null : Math.round((correct / total) * 10000) / 100,
      };
    });
    trends.push({ subjectId, subjectName, points });
  }

  return trends.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
}

// A rough subject-matter icon per module, purely cosmetic (matches a
// reference mockup); falls back to a generic book for anything unrecognized.
export function iconForModule(moduleName: string): string {
  const lower = moduleName.toLowerCase();
  if (lower.includes("chemical") || lower.includes("reaction")) return "🧪";
  if (lower.includes("cell") || lower.includes("life")) return "🧬";
  if (lower.includes("electric")) return "⚡";
  if (lower.includes("thermo")) return "🔥";
  if (lower.includes("measurement") || lower.includes("physical world")) return "📏";
  return "📘";
}

// Same idea as iconForModule but keyed on subject name, for the Weak Areas
// subject tiles' header icon (subjects table has no icon column). Only
// Science is seeded today; the other branches are here so Business
// Studies/Geography/etc. tiles get a sensible icon the moment they exist,
// with no code change needed at that point.
export function iconForSubject(subjectName: string): string {
  const lower = subjectName.toLowerCase();
  if (lower.includes("science")) return "🧪";
  if (lower.includes("business")) return "💼";
  if (lower.includes("geography")) return "🌍";
  if (lower.includes("math")) return "📐";
  if (lower.includes("history")) return "📜";
  if (lower.includes("english") || lower.includes("language")) return "🗣️";
  return "📘";
}
