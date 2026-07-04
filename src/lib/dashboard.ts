import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import {
  masteryScores,
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
  score: number | null;
  label: SubTopicStatusLabel;
};

// One row per sub-topic for the student's grade, joined with their mastery
// score if they've attempted it. Backs the dashboard's progress card, the
// practice list, the sidebar's practice count, and the progress bar chart.
export async function getSubTopicStatusesForGrade(
  studentId: string,
  grade: "10" | "11",
): Promise<SubTopicStatus[]> {
  const gradeModules = await db.query.modules.findMany({
    where: eq(modules.grade, grade),
    orderBy: modules.sortOrder,
    with: { subTopics: { orderBy: subTopics.sortOrder } },
  });

  const scores = await db
    .select()
    .from(masteryScores)
    .where(eq(masteryScores.studentId, studentId));
  const scoreBySubTopic = new Map(scores.map((s) => [s.subTopicId, Number(s.score)]));

  const statuses: SubTopicStatus[] = [];
  for (const gradeModule of gradeModules) {
    for (const subTopic of gradeModule.subTopics) {
      const score = scoreBySubTopic.get(subTopic.id) ?? null;
      statuses.push({
        id: subTopic.id,
        name: subTopic.name,
        moduleName: gradeModule.name,
        score,
        label: score === null ? "not_started" : masteryLabelForScore(score),
      });
    }
  }
  return statuses;
}

export type ContinueSubTopic = {
  subTopicId: string;
  subTopicName: string;
  moduleName: string;
  score: number;
  label: MasteryLabel;
};

// The student's most recently completed attempt, regardless of how it
// scored — there's no partial/mid-quiz progress tracking in this MVP (the
// quiz is a single-page submit), so "continue" means "pick this sub-topic
// back up," not "resume this exact attempt."
export async function getContinueSubTopic(studentId: string): Promise<ContinueSubTopic | null> {
  // Only ever considers sub-topic attempts — paper attempts (subTopicId
  // null) are a separate flow not reconciled into this card yet.
  const lastAttempt = await db.query.quizAttempts.findFirst({
    where: and(
      eq(quizAttempts.studentId, studentId),
      isNotNull(quizAttempts.completedAt),
      isNotNull(quizAttempts.subTopicId),
    ),
    orderBy: desc(quizAttempts.completedAt),
  });
  if (!lastAttempt || !lastAttempt.subTopicId) return null;

  const subTopic = await db.query.subTopics.findFirst({
    where: eq(subTopics.id, lastAttempt.subTopicId),
    with: { module: true },
  });
  if (!subTopic) return null;

  const score = Number(lastAttempt.score ?? 0);
  return {
    subTopicId: subTopic.id,
    subTopicName: subTopic.name,
    moduleName: subTopic.module.name,
    score,
    label: masteryLabelForScore(score),
  };
}

export type CompletedQuiz = {
  attemptId: string;
  title: string;
  completedAt: Date;
  correctCount: number;
  total: number;
};

// Every completed attempt, sub-topic or paper — resolves whichever title
// applies rather than reconciling the two into one tracking model.
export async function getCompletedQuizzes(
  studentId: string,
  limit = 20,
): Promise<CompletedQuiz[]> {
  const attempts = await db
    .select({
      id: quizAttempts.id,
      subTopicId: quizAttempts.subTopicId,
      paperId: quizAttempts.paperId,
      completedAt: quizAttempts.completedAt,
    })
    .from(quizAttempts)
    .where(and(eq(quizAttempts.studentId, studentId), isNotNull(quizAttempts.completedAt)))
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
      completedAt: attempt.completedAt!,
      correctCount: counts.correct,
      total: counts.total,
    };
  });
}

export type ProgressStats = {
  quizzesCompleted: number;
  averageScore: number | null;
  masteredCount: number;
  totalSubTopics: number;
  subTopicBars: { name: string; score: number | null; label: SubTopicStatusLabel }[];
};

export async function getProgressStats(
  studentId: string,
  grade: "10" | "11",
): Promise<ProgressStats> {
  const statuses = await getSubTopicStatusesForGrade(studentId, grade);

  const attempts = await db
    .select({ score: quizAttempts.score })
    .from(quizAttempts)
    .where(and(eq(quizAttempts.studentId, studentId), isNotNull(quizAttempts.completedAt)));

  const quizzesCompleted = attempts.length;
  const averageScore =
    quizzesCompleted === 0
      ? null
      : attempts.reduce((sum, a) => sum + Number(a.score ?? 0), 0) / quizzesCompleted;

  return {
    quizzesCompleted,
    averageScore,
    masteredCount: statuses.filter((s) => s.label === "mastered").length,
    totalSubTopics: statuses.length,
    subTopicBars: statuses.map((s) => ({ name: s.name, score: s.score, label: s.label })),
  };
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
