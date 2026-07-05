import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { papers, quizAttemptAnswers, quizAttempts } from "@/db/schema";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { getQuizForPaper, masteryLabelForScore, MARKS_PER_QUESTION, type MasteryLabel } from "@/lib/quiz";

const MASTERY_LABEL_TEXT: Record<MasteryLabel, string> = {
  needs_work: "Needs work",
  in_progress: "In progress",
  mastered: "Mastered",
};

export default async function PaperQuizResultsPage({
  params,
}: {
  params: Promise<{ paperId: string; attemptId: string }>;
}) {
  const { paperId, attemptId } = await params;

  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  const attempt = await db.query.quizAttempts.findFirst({
    where: eq(quizAttempts.id, attemptId),
  });
  if (
    !attempt ||
    attempt.studentId !== appUser.id ||
    attempt.paperId !== paperId ||
    attempt.completedAt === null
  ) {
    notFound();
  }

  const paper = await db.query.papers.findFirst({ where: eq(papers.id, paperId) });

  const [{ questions }, answeredRows] = await Promise.all([
    getQuizForPaper(paperId),
    db
      .select({ isCorrect: quizAttemptAnswers.isCorrect })
      .from(quizAttemptAnswers)
      .where(eq(quizAttemptAnswers.quizAttemptId, attemptId)),
  ]);
  const totalQuestions = questions.length;
  const questionsAnswered = answeredRows.length;
  const correctCount = answeredRows.filter((a) => a.isCorrect).length;

  const scoreNum = Number(attempt.score ?? 0);
  const label = masteryLabelForScore(scoreNum);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-6 bg-quiz-bg p-8 text-center">
      <div className="rounded-xl border border-quiz-border bg-quiz-card-bg px-8 py-7">
        <p className="text-sm text-quiz-grey-text">{paper?.title}</p>
        <h1 className="mt-1 text-4xl font-extrabold tracking-tight text-quiz-navy-light">{scoreNum}%</h1>
        <p className="mt-2 inline-block rounded-full bg-quiz-purple-bg px-3 py-1 text-sm font-semibold text-quiz-purple-text">
          {MASTERY_LABEL_TEXT[label]}
        </p>
        <p className="mt-3 text-sm text-quiz-grey-text">
          {questionsAnswered} of {totalQuestions} questions answered · {correctCount} correct
        </p>
        <p className="mt-1 text-sm text-quiz-grey-text">
          Marks: {correctCount * MARKS_PER_QUESTION} / {totalQuestions * MARKS_PER_QUESTION}
        </p>
      </div>

      <div className="flex gap-3">
        <Link
          href={`/quiz/papers/${paperId}`}
          className="rounded-lg border border-quiz-option-border bg-white px-5 py-2.5 text-sm font-bold text-quiz-navy hover:border-quiz-navy-light"
        >
          Retake this paper
        </Link>
        <Link
          href="/dashboard"
          className="rounded-lg bg-quiz-navy px-5 py-2.5 text-sm font-bold text-white"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
