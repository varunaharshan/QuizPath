import { and, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  masteryScores,
  mcqs,
  modules,
  papers,
  quizAttemptAnswers,
  quizAttempts,
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

export type ContinueAttempt = {
  type: "paper" | "topic_practice";
  // The paper's id (for a paper attempt) or the sub-topic's id (for a
  // topic-practice attempt) — whichever the Resume button should link to.
  id: string;
  name: string;
  source: string;
  totalQuestions: number;
  questionsDone: number;
};

// The student's most recently *started but not yet completed* attempt for
// their own grade — genuinely resumable. Written generally over both paper
// and sub-topic attempts rather than hardcoding "paper only" — since both
// flows now have real start/resume semantics (ensurePaperAttemptStarted /
// ensureSubTopicAttemptStarted in src/lib/quiz.ts), either can be the
// in-progress row this returns.
//
// `questionsDone` is a real live count from quiz_attempt_answers (each
// answer is saved incrementally as the student picks it — see "Save and
// resume" in CLAUDE.md), not a placeholder — matching the mockup's "24 of 40
// questions done" progress bar rather than the earlier always-0 deviation
// from it.
export async function getContinueAttempt(
  studentId: string,
  grade: "10" | "11",
): Promise<ContinueAttempt | null> {
  const [incomplete] = await db
    .select({
      id: quizAttempts.id,
      subTopicId: quizAttempts.subTopicId,
      paperId: quizAttempts.paperId,
    })
    .from(quizAttempts)
    .leftJoin(subTopics, eq(subTopics.id, quizAttempts.subTopicId))
    .leftJoin(modules, eq(modules.id, subTopics.moduleId))
    .leftJoin(papers, eq(papers.id, quizAttempts.paperId))
    .where(
      and(
        eq(quizAttempts.studentId, studentId),
        isNull(quizAttempts.completedAt),
        or(eq(modules.grade, grade), eq(papers.grade, grade)),
      ),
    )
    .orderBy(desc(quizAttempts.startedAt))
    .limit(1);
  if (!incomplete) return null;

  const savedAnswers = await db
    .select({ id: quizAttemptAnswers.id })
    .from(quizAttemptAnswers)
    .where(eq(quizAttemptAnswers.quizAttemptId, incomplete.id));
  const questionsDone = savedAnswers.length;

  if (incomplete.paperId) {
    const paper = await db.query.papers.findFirst({ where: eq(papers.id, incomplete.paperId) });
    if (!paper) return null;

    const questions = await db
      .select({ id: mcqs.id })
      .from(mcqs)
      .where(and(eq(mcqs.paperId, paper.id), eq(mcqs.status, "published")));

    return {
      type: "paper",
      id: paper.id,
      name: paper.title,
      source: paper.source ?? `${paper.paperType.charAt(0).toUpperCase()}${paper.paperType.slice(1)} paper`,
      totalQuestions: questions.length,
      questionsDone,
    };
  }

  if (incomplete.subTopicId) {
    const subTopic = await db.query.subTopics.findFirst({ where: eq(subTopics.id, incomplete.subTopicId) });
    if (!subTopic) return null;

    const questions = await db
      .select({ id: mcqs.id })
      .from(mcqs)
      .where(and(eq(mcqs.subTopicId, subTopic.id), eq(mcqs.status, "published")));

    return {
      type: "topic_practice",
      id: subTopic.id,
      name: subTopic.name,
      source: "Practice quiz",
      totalQuestions: questions.length,
      questionsDone,
    };
  }

  return null;
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
    };
  });
}

export type TopicProgress = {
  id: string;
  name: string;
  questionsAnswered: number;
  correctCount: number;
  score: number | null; // null (not 0) when questionsAnswered is 0 — "not started", not "0%".
  label: SubTopicStatusLabel;
};

export type ProgressStats = {
  quizzesCompleted: number;
  totalQuestionsAnswered: number;
  totalCorrectAnswers: number;
  averageScore: number | null;
  // Every sub-topic for this grade+subject, in syllabus order (module
  // sortOrder, then sub-topic sortOrder) — not sorted by weakness. The
  // Progress tab's single "Mastery by topic" table renders this list as-is.
  topics: TopicProgress[];
};

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
// Each topic's questionsAnswered/correctCount is computed live from
// quiz_attempt_answers (the same source of truth
// recalculateMasteryForSubTopic writes from), rather than read out of the
// mastery_scores cache — this table needs an exact raw "Correct" count
// alongside the percentage, and re-deriving an integer count from a
// already-rounded stored percentage risks an off-by-one in the displayed
// math.
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
  const orderedSubTopics = gradeModules.flatMap((m) => m.subTopics);
  const subTopicIds = orderedSubTopics.map((s) => s.id);

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

  const topics: TopicProgress[] = orderedSubTopics.map((subTopic) => {
    const counts = countsBySubTopic.get(subTopic.id) ?? { questionsAnswered: 0, correctCount: 0 };
    const score =
      counts.questionsAnswered === 0
        ? null
        : Math.round((counts.correctCount / counts.questionsAnswered) * 10000) / 100;
    return {
      id: subTopic.id,
      name: subTopic.name,
      questionsAnswered: counts.questionsAnswered,
      correctCount: counts.correctCount,
      score,
      label: score === null ? "not_started" : masteryLabelForScore(score),
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

// Ranks topics for the Dashboard's "Recommended practice" card: topics
// closest to crossing the 60% "needs work" threshold from below (40-59%)
// come first, since they're closest to being fixed; topics further below
// that (<40%) fall back to lowest-score-first (most urgent); topics with
// zero questions answered rank last — there's no evidence yet that they
// specifically need remedial practice, just that they haven't been tried.
// Already-`in_progress`/`mastered` topics are excluded entirely (they're not
// in need of recommended work). A pure function over already-fetched
// `ProgressStats.topics`, independent of any particular grade/subject query,
// so it's directly testable without a database.
export function rankRecommendedPracticeTopics(topics: TopicProgress[], limit = 2): TopicProgress[] {
  const candidates = topics.filter((t) => t.label === "needs_work" || t.label === "not_started");

  const tierOf = (t: TopicProgress): 0 | 1 | 2 => {
    if (t.score === null) return 2; // not started -> last
    if (t.score >= 40) return 0; // 40-59% -> closest to crossing 60%, first
    return 1; // <40% -> lowest-score-first fallback tier
  };

  const ranked = [...candidates].sort((a, b) => {
    const tierA = tierOf(a);
    const tierB = tierOf(b);
    if (tierA !== tierB) return tierA - tierB;
    if (tierA === 0) return (b.score ?? 0) - (a.score ?? 0); // 40-59%: descending, closest-to-60 first
    if (tierA === 1) return (a.score ?? 0) - (b.score ?? 0); // <40%: ascending, most urgent first
    return 0; // not started: stable order among themselves
  });

  return ranked.slice(0, limit);
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
