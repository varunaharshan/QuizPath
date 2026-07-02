import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  masteryScores,
  mcqs,
  modules,
  quizAttemptAnswers,
  quizAttempts,
  subTopics,
} from "@/db/schema";

// MVP quiz length. Sub-topics with fewer published MCQs than this just serve
// everything they have.
export const QUIZ_LENGTH = 10;

export type MasteryLabel = "needs_work" | "in_progress" | "mastered";

// Rules-based mastery, per spec section 5: below 60% = needs work, 80%+ =
// mastered. 60-79% didn't have an explicit bucket in the spec; treated as a
// third "in progress" tier rather than lumping it in with "needs work".
export function masteryLabelForScore(score: number): MasteryLabel {
  if (score < 60) return "needs_work";
  if (score >= 80) return "mastered";
  return "in_progress";
}

export type ModuleWithSubTopics = {
  id: string;
  name: string;
  subTopics: { id: string; name: string }[];
};

export async function getSubTopicsForGrade(grade: "10" | "11"): Promise<ModuleWithSubTopics[]> {
  return db.query.modules.findMany({
    where: eq(modules.grade, grade),
    orderBy: modules.sortOrder,
    with: {
      subTopics: { orderBy: subTopics.sortOrder },
    },
  });
}

export type QuizQuestion = {
  id: string;
  questionText: string;
  options: string[];
};

export type Quiz = {
  subTopic: { id: string; name: string } | null;
  questions: QuizQuestion[];
};

// The quiz-serving core: published MCQs for a sub-topic, capped at
// QUIZ_LENGTH, with the answer key stripped out before it ever reaches a
// client.
export async function getQuizForSubTopic(subTopicId: string): Promise<Quiz> {
  const subTopic = await db.query.subTopics.findFirst({
    where: eq(subTopics.id, subTopicId),
  });
  if (!subTopic) {
    return { subTopic: null, questions: [] };
  }

  const questions = await db
    .select({ id: mcqs.id, questionText: mcqs.questionText, options: mcqs.options })
    .from(mcqs)
    .where(and(eq(mcqs.subTopicId, subTopicId), eq(mcqs.status, "published")))
    .limit(QUIZ_LENGTH);

  return { subTopic: { id: subTopic.id, name: subTopic.name }, questions };
}

export type SubmitQuizResult = {
  attemptId: string;
  score: number;
  correctCount: number;
  total: number;
  masteryLabel: MasteryLabel;
};

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

// Grades server-side against the real answer key (never trusts a
// "correct"/"incorrect" flag from the client), logs the attempt + per-question
// answers, and recalculates mastery for the sub-topic in one transaction.
export async function submitQuizAttempt(params: {
  studentId: string;
  subTopicId: string;
  answers: Record<string, number>;
}): Promise<SubmitQuizResult> {
  const { studentId, subTopicId, answers } = params;
  const mcqIds = Object.keys(answers);

  const questionBank = await db
    .select({ id: mcqs.id, correctOption: mcqs.correctOption })
    .from(mcqs)
    .where(
      and(
        eq(mcqs.subTopicId, subTopicId),
        eq(mcqs.status, "published"),
        inArray(mcqs.id, mcqIds.length > 0 ? mcqIds : [NIL_UUID]),
      ),
    );

  if (questionBank.length === 0) {
    throw new Error("No valid questions were submitted for this sub-topic.");
  }

  const total = questionBank.length;
  let correctCount = 0;
  const gradedAnswers = questionBank.map((mcq) => {
    const selectedOption = answers[mcq.id] ?? -1;
    const isCorrect = selectedOption === mcq.correctOption;
    if (isCorrect) correctCount += 1;
    return { mcqId: mcq.id, selectedOption, isCorrect };
  });

  const score = Math.round((correctCount / total) * 10000) / 100;
  const masteryLabel = masteryLabelForScore(score);
  const now = new Date();
  const scoreStr = score.toFixed(2);

  const attemptId = await db.transaction(async (tx) => {
    const [attempt] = await tx
      .insert(quizAttempts)
      .values({
        studentId,
        subTopicId,
        startedAt: now,
        completedAt: now,
        score: scoreStr,
      })
      .returning({ id: quizAttempts.id });

    await tx.insert(quizAttemptAnswers).values(
      gradedAnswers.map((a) => ({
        quizAttemptId: attempt.id,
        mcqId: a.mcqId,
        selectedOption: a.selectedOption,
        isCorrect: a.isCorrect,
      })),
    );

    // Mastery is simply the most recent attempt's score for that sub-topic —
    // simplest rules-based reading of "recalculated after the attempt" for
    // MVP; no historical averaging.
    await tx
      .insert(masteryScores)
      .values({ studentId, subTopicId, score: scoreStr, lastUpdated: now })
      .onConflictDoUpdate({
        target: [masteryScores.studentId, masteryScores.subTopicId],
        set: { score: scoreStr, lastUpdated: now },
      });

    return attempt.id;
  });

  return { attemptId, score, correctCount, total, masteryLabel };
}
