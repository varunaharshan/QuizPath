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
import { moduleGradesForQuery } from "@/lib/reference-data";

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
// narrows to a specific subject. `grade` may be "gcse" — see
// moduleGradesForQuery; the returned rows are grouped by grade (all of Grade
// 10's modules in syllabus order, then all of Grade 11's), not interleaved.
export async function getSubTopicStatusesForGrade(
  studentId: string,
  grade: string,
  subjectId?: string,
): Promise<SubTopicStatus[]> {
  const moduleGrades = moduleGradesForQuery(grade);
  const gradeModules = await db.query.modules.findMany({
    where: subjectId
      ? and(inArray(modules.grade, moduleGrades), eq(modules.subjectId, subjectId))
      : inArray(modules.grade, moduleGrades),
    orderBy: [modules.grade, modules.sortOrder],
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
// without a grade filter. `type` is likewise optional — the Dashboard's own
// "Recent Full Tests" / "Recent Practices" widgets each call this once with
// their own `type` and `limit`, so each widget's cap (3 rows) is guaranteed
// regardless of how the other type is mixed in, rather than splitting one
// shared, unfiltered fetch after the fact. `subjectId`, likewise optional,
// scopes to one subject (via the sub-topic's module, or the paper, whichever
// applies) — the Dashboard's per-subject switcher calls this once per
// subject to pre-fetch every subject's own Recent Full Tests/Practices up
// front, so switching the active subject is a client-side read of
// already-fetched data rather than a new request. `grade`, when provided,
// may be "gcse" — the sub-topic-practice half of the OR below widens via
// moduleGradesForQuery (a practice attempt counts if its module is Grade 10
// or 11), while the paper half stays an exact match against the literal
// requested grade (a paper attempt counts only if it's genuinely tagged
// "gcse" itself, not any Grade 10/11 paper) — same split as
// getProgressStats' own attempts query, for the same reason.
export async function getCompletedQuizzes(
  studentId: string,
  options: { grade?: string; limit?: number; type?: "paper" | "topic_practice"; subjectId?: string } = {},
): Promise<CompletedQuiz[]> {
  const { grade, limit = 20, type, subjectId } = options;

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
        grade ? or(inArray(modules.grade, moduleGradesForQuery(grade)), eq(papers.grade, grade)) : undefined,
        type === "paper" ? isNotNull(quizAttempts.paperId) : undefined,
        type === "topic_practice" ? isNotNull(quizAttempts.subTopicId) : undefined,
        subjectId ? or(eq(modules.subjectId, subjectId), eq(papers.subjectId, subjectId)) : undefined,
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
// *completed* attempt instead of the most recent *incomplete* one. Same
// "gcse" split as getCompletedQuizzes/getProgressStats: the module side
// widens via moduleGradesForQuery, the paper side stays an exact match.
export async function getMostRecentlyPracticedSubjectId(
  studentId: string,
  grade: string,
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
        or(inArray(modules.grade, moduleGradesForQuery(grade)), eq(papers.grade, grade)),
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
  // The owning module's own grade ("10" or "11") — lets a caller widened via
  // includeGrade10 (see withGrade10Toggle below) tell a foundational Grade
  // 10 row apart from the page's own primary grade, to render a "Grade 10"
  // tag. Always just the module's real, literal grade column; never "gcse"
  // (a gcse request's own topics are each still one real underlying grade).
  grade: string;
  // Every sub-topic under this topic (module), in syllabus sortOrder — for
  // the Progress tab's expandable per-topic drill-down. A question with no
  // sub_topic_id has no topic association at all in this schema (mcqs has
  // no module/topic FK of its own, only subTopicId), so there's no
  // "untagged" bucket to add here — every question this topic's own
  // questionsAnswered/correctCount could possibly include already belongs
  // to exactly one of these sub-topics.
  subTopics: SubTopicProgress[];
};

// Explicit, opt-in widening for the Grade 11 "Include Grade 10 foundational
// topics" toggle (Weak Areas, By Topic, Dashboard's Topic Performance card
// only — see each call site). Deliberately NOT folded into
// moduleGradesForQuery itself: grade "11" must keep resolving to just
// ["11"] by default everywhere, with no special-casing of "11" the way
// "gcse" is special-cased. A caller must explicitly pass includeGrade10:
// true to widen; a "10" or "gcse" request is already a no-op here since
// both already include "10".
export function withGrade10Toggle(moduleGrades: string[], includeGrade10: boolean): string[] {
  if (!includeGrade10 || moduleGrades.includes("10")) return moduleGrades;
  return [...moduleGrades, "10"];
}

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
// `grade` may be "gcse" though (see moduleGradesForQuery) — there's no
// GCSE-owned taxonomy, so a "gcse" request is itself the one deliberate
// cross-grade view: the combined Grade 10 + Grade 11 syllabus for this
// subject, grouped by grade (not interleaved) in the returned `topics`.
//
// The 4 KPI cards are cumulative counts across every completed attempt that
// belongs to this grade+subject (via the sub-topic's module, or the paper's
// own grade/subject) — `averageScore` is total correct ÷ total questions
// answered, deliberately NOT an average of each attempt's own percentage
// (that would weight a 2-question attempt the same as a 40-question one,
// double-counting the smaller sample). For "gcse", only the module side of
// that OR widens to Grade 10/11 (a practice attempt counts if its module is
// either); the paper side stays an exact match against "gcse" itself (a
// Grade 10 or 11 PAPER attempt does not count toward "gcse" quizzesCompleted
// — only a paper genuinely tagged "gcse" does). This is what keeps
// quizzesCompleted and the topics breakdown below from disagreeing the way
// they would for an ordinary mixed-grade paper: as long as a "gcse" paper's
// questions are all tagged with a real Grade 10/11 sub_topic_id (the stated
// design — no untagged GCSE questions), every answer counted into
// totalQuestionsAnswered here also has a home in `topics`, because `topics`'
// own subTopicIds now span both grades those questions could be tagged
// under.
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
//
// `includeGrade10` is the Grade 11 "Include Grade 10 foundational topics"
// toggle (see withGrade10Toggle above), off by default — passing it widens
// moduleGrades for BOTH the `topics` breakdown and the `attempts`/
// quizzesCompleted query's own module-side condition (reusing the exact
// same widened `moduleGrades` variable for each, the same mechanism GCSE's
// own union relies on), so a widened-in Grade 10 sub-topic PRACTICE attempt
// counts toward quizzesCompleted and has a home in `topics` at the same
// time. The paper-side condition (`eq(papers.grade, grade)`) is deliberately
// NEVER widened — a Grade 10 PAPER attempt must not count as a Grade 11
// "quiz completed" just because the toggle is on. One known, accepted
// consequence: a Grade 10 paper attempt's answers, if tagged to a
// (now-included) Grade 10 sub-topic, can still appear in that sub-topic's
// own `topics` row even though that attempt isn't counted in
// quizzesCompleted — topic-level mastery is always the true cumulative
// total for that sub-topic regardless of source, matching how mastery
// works everywhere else in this app. This means quizzesCompleted/
// totalQuestionsAnswered can no longer be assumed to exactly equal the
// summed `topics` once includeGrade10 is true — by-topic/page.tsx's
// empty-state check accounts for this directly (see its own comment).
export async function getProgressStats(
  studentId: string,
  grade: string,
  subjectId: string,
  includeGrade10 = false,
): Promise<ProgressStats> {
  const moduleGrades = withGrade10Toggle(moduleGradesForQuery(grade), includeGrade10);
  const gradeModules = await db.query.modules.findMany({
    where: and(inArray(modules.grade, moduleGrades), eq(modules.subjectId, subjectId)),
    orderBy: [modules.grade, modules.sortOrder],
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
      grade: gradeModule.grade,
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
          and(inArray(modules.grade, moduleGrades), eq(modules.subjectId, subjectId)),
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

// By Topic's own empty-state gate — pulled out as a pure function (this
// codebase's established pattern for page-level display logic with no
// component-rendering test harness, e.g. quiz-ui.ts's computeQuizProgress)
// rather than left as an inline expression in page.tsx. Plain
// `quizzesCompleted === 0` is enough when includeGrade10 is false (today's
// unchanged behavior), but once the toggle widens the `topics` breakdown, a
// student whose only Grade 10 exposure was via a Grade 10 *paper* (never a
// standalone Grade 10 practice attempt) would have real widened topic data
// while quizzesCompleted still reads 0 — see getProgressStats' own comment
// on why quizzesCompleted/topics can diverge once includeGrade10 is true.
export function isProgressStatsEmpty(stats: ProgressStats, includeGrade10: boolean): boolean {
  return stats.quizzesCompleted === 0 && !(includeGrade10 && stats.topics.some((t) => t.questionsAnswered > 0));
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
// by that true aggregate score — weakest topic first. `grade` may be "gcse"
// (see moduleGradesForQuery) — the combined Grade 10 + 11 topic list is
// grouped by grade (not interleaved) before this function's own weakest-first
// sort reorders it by score.
// `includeGrade10` is the Grade 11 "Include Grade 10 foundational topics"
// toggle (see withGrade10Toggle above) — off by default, byte-for-byte
// identical to today's behavior when omitted. When true, Grade 10's own
// modules are unioned in the same way a "gcse" request already unions both
// grades, grouped by grade (not interleaved) same as everywhere else, and
// each returned topic carries the owning module's real `grade` so the UI
// can tag a Grade 10 row when it's showing alongside Grade 11's own topics.
export async function getWeakTopicsForGrade(
  studentId: string,
  grade: string,
  includeGrade10 = false,
): Promise<TopicProgress[]> {
  const gradeModules = await db.query.modules.findMany({
    where: inArray(modules.grade, withGrade10Toggle(moduleGradesForQuery(grade), includeGrade10)),
    orderBy: [modules.grade, modules.sortOrder],
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
      grade: gradeModule.grade,
      questionsAnswered,
      correctCount,
      score,
      label,
      subTopics: weakSubTopicRows,
    });
  }

  return topics.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
}

export type TopicStatus = TopicProgress & {
  subjectId: string;
  subjectName: string;
};

// Topic (module)-level analog of getSubTopicStatusesForGrade, for the
// Dashboard's "Topic Performance" card — that card previously listed
// sub-topics directly (e.g. "Displacement and Distance"), which reads as
// the wrong grain once By Topic/Weak Areas both established "Topic is the
// primary row, sub-topic is the drill-down" elsewhere in this app. Same
// mastery_scores-cache data source and rollup math as getWeakTopicsForGrade
// (correctCount reconstructed as round(score/100 * questionsAnswered), same
// known staleness/precision caveats documented there), just without the
// needs_work filter — every topic for the grade is returned, across every
// subject, including not_started ones (score null), so callers can pick
// whichever slice they need (the Dashboard selects the top 3 highest-scoring
// per subject) rather than this function baking in one specific selection.
// `grade` may be "gcse" (see moduleGradesForQuery) — grouped by grade, not
// interleaved, same as every other topic query in this file.
// `includeGrade10` is the Grade 11 "Include Grade 10 foundational topics"
// toggle (see withGrade10Toggle above) — off by default, byte-for-byte
// identical to today's behavior when omitted; see getWeakTopicsForGrade's
// own comment for the shared reasoning.
export async function getTopicStatusesForGrade(
  studentId: string,
  grade: string,
  includeGrade10 = false,
): Promise<TopicStatus[]> {
  const gradeModules = await db.query.modules.findMany({
    where: inArray(modules.grade, withGrade10Toggle(moduleGradesForQuery(grade), includeGrade10)),
    orderBy: [modules.grade, modules.sortOrder],
    with: { subTopics: { orderBy: subTopics.sortOrder }, subject: true },
  });

  const scores = await db.select().from(masteryScores).where(eq(masteryScores.studentId, studentId));
  const scoreBySubTopic = new Map(
    scores.map((s) => [s.subTopicId, { score: Number(s.score), questionsAnswered: s.questionsAnswered }]),
  );

  return gradeModules.map((gradeModule) => {
    const subTopicRows: SubTopicProgress[] = gradeModule.subTopics.map((subTopic) => {
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

    const topicCounts = {
      questionsAnswered: subTopicRows.reduce((sum, s) => sum + s.questionsAnswered, 0),
      correctCount: subTopicRows.reduce((sum, s) => sum + s.correctCount, 0),
    };

    return {
      id: gradeModule.id,
      name: gradeModule.name,
      grade: gradeModule.grade,
      subjectId: gradeModule.subject.id,
      subjectName: gradeModule.subject.name,
      ...topicCounts,
      ...scoreAndLabel(topicCounts),
      subTopics: subTopicRows,
    };
  });
}

export type OverallStats = {
  quizzesCompleted: number;
  totalQuestionsAnswered: number;
  totalCorrectAnswers: number;
  averageScore: number | null;
};

export type GceGrade = "A" | "B" | "C" | "S" | "W";

// Direct mapping of a subject's own Score % onto the standard G.C.E. O/L
// grading scale for the "Your subjects" switcher's grade badge — a plain
// band lookup on the real, measured score, not a difficulty-adjusted or
// predicted grade. Bands: 75-100 A, 65-74 B, 50-64 C, 35-49 S, 0-34 W.
// Callers are responsible for the "no data yet" case (a subject with zero
// questions answered shows "Not started" instead of calling this at all —
// there's no sixth band for "ungraded").
export function gceGradeForScore(score: number): GceGrade {
  if (score >= 75) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "S";
  return "W";
}

// Per-subject cumulative stats for the Dashboard's KPI row — scoped to
// whichever subject the new "Your subjects" switcher has active, mirroring
// getProgressStats's own grade+subject scoping (though that function is a
// live cross-attempt-type rollup for the By Topic page and stays
// untouched). Deliberately restricted to completed PAPER attempts only,
// same as getPaperAccuracyTrend — a full past-paper attempt is the closest
// thing this app has to an exam-condition signal, and blending in
// practice-session (sub-topic) attempts would let a handful of small,
// single-sub-topic drills dominate what's meant to read as "how are you
// doing on real tests." Also backs each subject switcher card's own grade
// badge (`averageScore` run through `gceGradeForScore`), so the KPI row's
// own "Score %" and the badge shown at the top of the page always agree.
export async function getOverallStats(studentId: string, grade: string, subjectId: string): Promise<OverallStats> {
  const attempts = await db
    .select({ id: quizAttempts.id })
    .from(quizAttempts)
    .innerJoin(papers, eq(papers.id, quizAttempts.paperId))
    .where(
      and(
        eq(quizAttempts.studentId, studentId),
        isNotNull(quizAttempts.completedAt),
        eq(papers.grade, grade),
        eq(papers.subjectId, subjectId),
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

export type PaperAccuracyPoint = {
  completedAt: Date;
  // This attempt's own score — never null, since finalizeAttempt requires
  // at least one saved answer before an attempt can be completed at all.
  score: number;
};

export type PaperAccuracyTrend = {
  subjectId: string;
  subjectName: string;
  // One point per completed paper attempt for this subject, in chronological
  // order — not a weekly bucket, and not a cumulative running average. A
  // subject with just one paper attempt so far has exactly one point here;
  // that's a valid, honest state (a single dot on the chart), not something
  // to pad out or hide behind a placeholder.
  points: PaperAccuracyPoint[];
};

// Real per-attempt accuracy trend for the Dashboard's "Subject Performance"
// chart — deliberately restricted to completed PAPER attempts only
// (quiz_attempts.paper_id set), never sub-topic practice sessions: a full
// past-paper attempt is the closest thing this app has to an exam-condition
// signal, and mixing in practice-session scores (typically smaller,
// single-sub-topic samples) would dilute that. Each point is that one
// attempt's own score, plotted at its own completedAt — not a weekly-
// bucketed cumulative average the way this chart used to work — so the
// line (or lone point) reads as "how did each real paper attempt go,
// in order," not a smoothed trend.
export async function getPaperAccuracyTrend(studentId: string, grade: string): Promise<PaperAccuracyTrend[]> {
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

  if (paperAttempts.length === 0) return [];

  const attemptIds = paperAttempts.map((a) => a.id);
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

  const bySubject = new Map<string, { subjectName: string; points: PaperAccuracyPoint[] }>();
  for (const attempt of paperAttempts) {
    if (!attempt.completedAt) continue;
    const counts = countsByAttempt.get(attempt.id);
    if (!counts || counts.total === 0) continue;
    const score = Math.round((counts.correct / counts.total) * 10000) / 100;
    const point: PaperAccuracyPoint = { completedAt: attempt.completedAt, score };
    const group = bySubject.get(attempt.subjectId);
    if (group) group.points.push(point);
    else bySubject.set(attempt.subjectId, { subjectName: attempt.subjectName, points: [point] });
  }

  const trends: PaperAccuracyTrend[] = [...bySubject.entries()].map(([subjectId, { subjectName, points }]) => ({
    subjectId,
    subjectName,
    points: points.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime()),
  }));

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
