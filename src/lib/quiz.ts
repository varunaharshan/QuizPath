import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { masteryScores, mcqs, papers, quizAttemptAnswers, quizAttempts, subTopics } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// MVP quiz length. Sub-topics with fewer published MCQs than this just serve
// everything they have.
export const QUIZ_LENGTH = 10;

// Purely presentational "Marks: X / Y" display on the results screen (every
// question carries equal weight — there's no per-question weight field in
// the schema). Fixed multiplier, not stored anywhere.
export const MARKS_PER_QUESTION = 2;

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
  // The one tag shown per question in the quiz-taking UI — sourced directly
  // from the existing sub_topic_id relationship, not a separate taxonomy
  // field. Null for a paper question that isn't tagged with a sub-topic.
  subTopicName: string | null;
};

export type Quiz = {
  subTopic: { id: string; name: string } | null;
  questions: QuizQuestion[];
};

// The quiz-serving core: published MCQs for a sub-topic, capped at
// QUIZ_LENGTH, with the answer key stripped out before it ever reaches a
// client. Ordered by createdAt (stable) rather than left unordered — once
// answers can be saved incrementally and resumed, the serve-set for a given
// sub-topic must stay identical across requests, or a resumed quiz could
// show a different set of questions than the ones already answered.
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
    .orderBy(mcqs.createdAt)
    .limit(QUIZ_LENGTH);

  // Every question in a sub-topic quiz belongs to that same sub-topic, so
  // the tag is constant across the set.
  return {
    subTopic: { id: subTopic.id, name: subTopic.name },
    questions: questions.map((q) => ({ ...q, subTopicName: subTopic.name })),
  };
}

export type SubmitQuizResult = {
  attemptId: string;
  score: number;
  correctCount: number;
  questionsAnswered: number;
  totalQuestions: number;
  masteryLabel: MasteryLabel;
};

// Marks a sub-topic quiz as "started" for a student, mirroring
// ensurePaperAttemptStarted: finds the student's in-progress (uncompleted)
// attempt for this sub-topic, or creates one. Idempotent — safe to call on
// every page load. Sub-topic quizzes previously had no start/resume state at
// all (submission was a single atomic insert); this gives them the same
// genuine start/resume semantics papers already had.
export async function ensureSubTopicAttemptStarted(
  studentId: string,
  subTopicId: string,
): Promise<string> {
  const existing = await db.query.quizAttempts.findFirst({
    where: and(
      eq(quizAttempts.studentId, studentId),
      eq(quizAttempts.subTopicId, subTopicId),
      isNull(quizAttempts.completedAt),
    ),
  });
  if (existing) return existing.id;

  const [created] = await db
    .insert(quizAttempts)
    .values({ studentId, subTopicId })
    .returning({ id: quizAttempts.id });
  return created.id;
}

// Every previously-saved answer for an in-progress (or just-completed)
// attempt, keyed by mcqId — lets a quiz page pre-fill radios on reload/resume.
export async function getExistingAnswers(attemptId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ mcqId: quizAttemptAnswers.mcqId, selectedOption: quizAttemptAnswers.selectedOption })
    .from(quizAttemptAnswers)
    .where(eq(quizAttemptAnswers.quizAttemptId, attemptId));

  const answers: Record<string, number> = {};
  for (const row of rows) {
    answers[row.mcqId] = row.selectedOption;
  }
  return answers;
}

// Saves (or changes) a single answer on an in-progress attempt, the moment
// the student picks it — this is what makes save-and-resume real, replacing
// the old model where every answer was batch-inserted only at final submit.
// Upserts on the (quizAttemptId, mcqId) unique constraint so revising a
// choice before submitting updates the same row rather than accumulating
// duplicates. Grades against the real answer key server-side, same as final
// submission — the client never needs to know whether its own choice was
// correct until the results page.
export async function saveQuizAnswer(params: {
  studentId: string;
  attemptId: string;
  mcqId: string;
  selectedOption: number;
}): Promise<void> {
  const { studentId, attemptId, mcqId, selectedOption } = params;

  const attempt = await db.query.quizAttempts.findFirst({
    where: eq(quizAttempts.id, attemptId),
  });
  if (!attempt || attempt.studentId !== studentId) {
    throw new Error("Quiz attempt not found.");
  }
  if (attempt.completedAt !== null) {
    throw new Error("This attempt has already been submitted.");
  }

  const mcq = await db.query.mcqs.findFirst({ where: eq(mcqs.id, mcqId) });
  if (!mcq || mcq.status !== "published") {
    throw new Error("Question not found.");
  }
  if (attempt.subTopicId !== null && mcq.subTopicId !== attempt.subTopicId) {
    throw new Error("Question does not belong to this attempt.");
  }
  if (attempt.paperId !== null && mcq.paperId !== attempt.paperId) {
    throw new Error("Question does not belong to this attempt.");
  }

  const isCorrect = selectedOption === mcq.correctOption;

  await db
    .insert(quizAttemptAnswers)
    .values({ quizAttemptId: attemptId, mcqId, selectedOption, isCorrect })
    .onConflictDoUpdate({
      target: [quizAttemptAnswers.quizAttemptId, quizAttemptAnswers.mcqId],
      set: { selectedOption, isCorrect },
    });
}

// Mastery for a sub-topic is a running cumulative ratio — total correct
// answers ever given on MCQs tagged with this sub_topic_id, over total
// questions ever answered for it — recalculated in full from
// quiz_attempt_answers on every attempt, rather than incrementally updated
// or overwritten with just the latest attempt's score. This is what lets
// provincial/district/school paper questions (any paper MCQ can also be
// tagged with a sub_topic_id) and ordinary sub-topic-quiz questions all
// contribute to the same running total for that sub-topic, regardless of
// which attempt or paper they came from. Doing a full re-aggregation (as
// opposed to storing running correct/total counters and incrementing them)
// means there's nothing to drift out of sync — it's always derived fresh
// from the source-of-truth answer log. Filtering to completedAt IS NOT NULL
// means an in-progress attempt's incrementally-saved answers are correctly
// excluded from mastery until the attempt is actually finalized.
async function recalculateMasteryForSubTopic(tx: Tx, studentId: string, subTopicId: string): Promise<void> {
  const answers = await tx
    .select({ isCorrect: quizAttemptAnswers.isCorrect })
    .from(quizAttemptAnswers)
    .innerJoin(mcqs, eq(mcqs.id, quizAttemptAnswers.mcqId))
    .innerJoin(quizAttempts, eq(quizAttempts.id, quizAttemptAnswers.quizAttemptId))
    .where(
      and(
        eq(mcqs.subTopicId, subTopicId),
        eq(quizAttempts.studentId, studentId),
        isNotNull(quizAttempts.completedAt),
      ),
    );

  const questionsAnswered = answers.length;
  const correctCount = answers.filter((a) => a.isCorrect).length;
  const score = questionsAnswered === 0 ? 0 : Math.round((correctCount / questionsAnswered) * 10000) / 100;
  const scoreStr = score.toFixed(2);
  const now = new Date();

  await tx
    .insert(masteryScores)
    .values({ studentId, subTopicId, score: scoreStr, questionsAnswered, lastUpdated: now })
    .onConflictDoUpdate({
      target: [masteryScores.studentId, masteryScores.subTopicId],
      set: { score: scoreStr, questionsAnswered, lastUpdated: now },
    });
}

// Marks an in-progress attempt complete and computes its score from whatever
// answers were actually saved for it — unanswered questions neither count as
// incorrect nor enter the denominator, so a 24-of-40 attempt with 18 correct
// scores 75% (18/24), not 45% (18/40). Requires at least one saved answer;
// callers are expected to have already gated the Submit action on that in the
// UI, but this is the authoritative check since it's also where a
// zero-answer submission would otherwise divide by zero.
async function finalizeAttempt(
  tx: Tx,
  attemptId: string,
): Promise<{ correctCount: number; questionsAnswered: number; score: number }> {
  const savedAnswers = await tx
    .select({ isCorrect: quizAttemptAnswers.isCorrect })
    .from(quizAttemptAnswers)
    .where(eq(quizAttemptAnswers.quizAttemptId, attemptId));

  const questionsAnswered = savedAnswers.length;
  if (questionsAnswered === 0) {
    throw new Error("Answer at least one question before submitting.");
  }

  const correctCount = savedAnswers.filter((a) => a.isCorrect).length;
  const score = Math.round((correctCount / questionsAnswered) * 10000) / 100;
  const now = new Date();

  await tx
    .update(quizAttempts)
    .set({ completedAt: now, score: score.toFixed(2) })
    .where(eq(quizAttempts.id, attemptId));

  return { correctCount, questionsAnswered, score };
}

// Finalizes a sub-topic attempt: the student must own it and it must not
// already be completed. totalQuestions comes from the same serve-set
// getQuizForSubTopic would produce, so the results page can show "18 of 40
// answered" even though only the answered ones were graded.
export async function finalizeSubTopicAttempt(params: {
  studentId: string;
  attemptId: string;
}): Promise<SubmitQuizResult> {
  const { studentId, attemptId } = params;

  const attempt = await db.query.quizAttempts.findFirst({
    where: eq(quizAttempts.id, attemptId),
  });
  if (!attempt || attempt.studentId !== studentId || attempt.subTopicId === null) {
    throw new Error("Quiz attempt not found.");
  }
  if (attempt.completedAt !== null) {
    throw new Error("This attempt has already been submitted.");
  }

  const { questions } = await getQuizForSubTopic(attempt.subTopicId);
  const totalQuestions = questions.length;

  const { correctCount, questionsAnswered, score } = await db.transaction(async (tx) => {
    const result = await finalizeAttempt(tx, attemptId);
    await recalculateMasteryForSubTopic(tx, studentId, attempt.subTopicId!);
    return result;
  });

  return {
    attemptId,
    score,
    correctCount,
    questionsAnswered,
    totalQuestions,
    masteryLabel: masteryLabelForScore(score),
  };
}

export type PaperQuiz = {
  paper: { id: string; title: string; grade: "10" | "11"; subjectId: string } | null;
  questions: QuizQuestion[];
};

// Serves every published question for the paper — no QUIZ_LENGTH cap, unlike
// sub-topic quizzes, since a paper attempt is meant to cover the whole paper.
// Includes grade/subjectId so the paper-taking page can link back to the
// right spot in the Grade → Subject → Papers navigation, whichever grade the
// student was browsing when they opened it.
export async function getQuizForPaper(paperId: string): Promise<PaperQuiz> {
  const paper = await db.query.papers.findFirst({ where: eq(papers.id, paperId) });
  if (!paper) {
    return { paper: null, questions: [] };
  }

  // Left join, not inner: a paper question doesn't have to be tagged with a
  // sub-topic (see "Medium and papers" in CLAUDE.md), so subTopicName is
  // null for an untagged question rather than dropping the row.
  const questions = await db
    .select({
      id: mcqs.id,
      questionText: mcqs.questionText,
      options: mcqs.options,
      subTopicName: subTopics.name,
    })
    .from(mcqs)
    .leftJoin(subTopics, eq(subTopics.id, mcqs.subTopicId))
    .where(and(eq(mcqs.paperId, paperId), eq(mcqs.status, "published")))
    .orderBy(mcqs.createdAt);

  return {
    paper: { id: paper.id, title: paper.title, grade: paper.grade, subjectId: paper.subjectId },
    questions,
  };
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

// Finalizes a paper attempt (started by ensurePaperAttemptStarted) — updates
// that same row rather than inserting a new one. Any of the paper's
// questions that are also tagged with a sub_topic_id (per the schema's "tag
// both where sensible" design) feed into that sub-topic's cumulative
// mastery, same as an ordinary sub-topic quiz would — a paper can cover
// several sub-topics at once, so every distinct one touched among the
// actually-answered questions gets recalculated.
export async function finalizePaperAttempt(params: {
  studentId: string;
  attemptId: string;
}): Promise<SubmitQuizResult> {
  const { studentId, attemptId } = params;

  const attempt = await db.query.quizAttempts.findFirst({
    where: eq(quizAttempts.id, attemptId),
  });
  if (!attempt || attempt.studentId !== studentId || attempt.paperId === null) {
    throw new Error("Quiz attempt not found.");
  }
  if (attempt.completedAt !== null) {
    throw new Error("This attempt has already been submitted.");
  }

  const { questions } = await getQuizForPaper(attempt.paperId);
  const totalQuestions = questions.length;

  const { correctCount, questionsAnswered, score } = await db.transaction(async (tx) => {
    const result = await finalizeAttempt(tx, attemptId);

    const answeredMcqIds = await tx
      .select({ mcqId: quizAttemptAnswers.mcqId })
      .from(quizAttemptAnswers)
      .where(eq(quizAttemptAnswers.quizAttemptId, attemptId));

    const touchedSubTopics = await tx
      .select({ subTopicId: mcqs.subTopicId })
      .from(mcqs)
      .where(
        inArray(
          mcqs.id,
          answeredMcqIds.map((a) => a.mcqId),
        ),
      );
    const touchedSubTopicIds = [...new Set(touchedSubTopics.map((t) => t.subTopicId))].filter(
      (id): id is string => id !== null,
    );

    for (const subTopicId of touchedSubTopicIds) {
      await recalculateMasteryForSubTopic(tx, studentId, subTopicId);
    }

    return result;
  });

  return {
    attemptId,
    score,
    correctCount,
    questionsAnswered,
    totalQuestions,
    masteryLabel: masteryLabelForScore(score),
  };
}
