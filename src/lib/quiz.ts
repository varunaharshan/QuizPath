import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { masteryScores, mcqs, papers, quizAttemptAnswers, quizAttempts, subTopics } from "@/db/schema";

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

function gradeAnswers(
  questionBank: { id: string; correctOption: number }[],
  answers: Record<string, number>,
) {
  let correctCount = 0;
  const gradedAnswers = questionBank.map((mcq) => {
    const selectedOption = answers[mcq.id] ?? -1;
    const isCorrect = selectedOption === mcq.correctOption;
    if (isCorrect) correctCount += 1;
    return { mcqId: mcq.id, selectedOption, isCorrect };
  });

  const total = questionBank.length;
  const score = Math.round((correctCount / total) * 10000) / 100;
  return { gradedAnswers, correctCount, total, score, masteryLabel: masteryLabelForScore(score) };
}

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

  const { gradedAnswers, correctCount, total, score, masteryLabel } = gradeAnswers(
    questionBank,
    answers,
  );
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

export type PaperQuiz = {
  paper: { id: string; title: string } | null;
  questions: QuizQuestion[];
};

// Serves every published question for the paper — no QUIZ_LENGTH cap, unlike
// sub-topic quizzes, since a paper attempt is meant to cover the whole paper.
export async function getQuizForPaper(paperId: string): Promise<PaperQuiz> {
  const paper = await db.query.papers.findFirst({ where: eq(papers.id, paperId) });
  if (!paper) {
    return { paper: null, questions: [] };
  }

  const questions = await db
    .select({ id: mcqs.id, questionText: mcqs.questionText, options: mcqs.options })
    .from(mcqs)
    .where(and(eq(mcqs.paperId, paperId), eq(mcqs.status, "published")));

  return { paper: { id: paper.id, title: paper.title }, questions };
}

// Marks a paper as "started" for Practice's Start/Resume/Retake status:
// finds the student's in-progress (uncompleted) attempt for this paper, or
// creates one. Idempotent — safe to call on every page load.
export async function ensurePaperAttemptStarted(
  studentId: string,
  paperId: string,
): Promise<string> {
  const existing = await db.query.quizAttempts.findFirst({
    where: and(
      eq(quizAttempts.studentId, studentId),
      eq(quizAttempts.paperId, paperId),
      isNull(quizAttempts.completedAt),
    ),
  });
  if (existing) return existing.id;

  const [created] = await db
    .insert(quizAttempts)
    .values({ studentId, paperId })
    .returning({ id: quizAttempts.id });
  return created.id;
}

// Grades and completes the student's in-progress attempt for this paper
// (started by ensurePaperAttemptStarted) — updates that same row rather than
// inserting a new one. Never touches mastery_scores: paper attempts aren't
// reconciled into sub-topic mastery tracking (a separate follow-up).
export async function submitPaperQuizAttempt(params: {
  studentId: string;
  paperId: string;
  answers: Record<string, number>;
}): Promise<SubmitQuizResult> {
  const { studentId, paperId, answers } = params;
  const mcqIds = Object.keys(answers);

  const questionBank = await db
    .select({ id: mcqs.id, correctOption: mcqs.correctOption })
    .from(mcqs)
    .where(
      and(
        eq(mcqs.paperId, paperId),
        eq(mcqs.status, "published"),
        inArray(mcqs.id, mcqIds.length > 0 ? mcqIds : [NIL_UUID]),
      ),
    );

  if (questionBank.length === 0) {
    throw new Error("No valid questions were submitted for this paper.");
  }

  const { gradedAnswers, correctCount, total, score, masteryLabel } = gradeAnswers(
    questionBank,
    answers,
  );
  const now = new Date();
  const scoreStr = score.toFixed(2);

  const attemptId = await ensurePaperAttemptStarted(studentId, paperId);

  await db.transaction(async (tx) => {
    await tx
      .update(quizAttempts)
      .set({ completedAt: now, score: scoreStr })
      .where(eq(quizAttempts.id, attemptId));

    await tx.insert(quizAttemptAnswers).values(
      gradedAnswers.map((a) => ({
        quizAttemptId: attemptId,
        mcqId: a.mcqId,
        selectedOption: a.selectedOption,
        isCorrect: a.isCorrect,
      })),
    );
  });

  return { attemptId, score, correctCount, total, masteryLabel };
}
