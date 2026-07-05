import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { ensurePaperAttemptStarted, getExistingAnswers, getQuizForPaper } from "@/lib/quiz";
import { QuizForm } from "@/components/quiz-form";
import { savePaperAnswer, submitPaperQuiz } from "./actions";

export default async function PaperQuizPage({
  params,
}: {
  params: Promise<{ paperId: string }>;
}) {
  const { paperId } = await params;

  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  const { paper, questions } = await getQuizForPaper(paperId);
  if (!paper) {
    notFound();
  }

  // Marks the paper as "in progress" the moment the student opens it, so a
  // later visit to Practice offers "Resume" instead of "Start" if they never
  // submit.
  const attemptId = await ensurePaperAttemptStarted(appUser.id, paperId);
  const existingAnswers = await getExistingAnswers(attemptId);

  const boundSaveAnswer = async (mcqId: string, selectedOption: number) => {
    "use server";
    await savePaperAnswer(attemptId, mcqId, selectedOption);
  };
  const boundSubmit = async () => {
    "use server";
    await submitPaperQuiz(paperId, attemptId);
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 p-8">
      <div>
        <Link
          href={`/quiz/grade/${paper.grade}/subjects/${paper.subjectId}`}
          className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
        >
          ← Choose a different paper
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{paper.title}</h1>
      </div>

      {questions.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">
          No questions are available for this paper yet.
        </p>
      ) : (
        <QuizForm
          questions={questions}
          initialAnswers={existingAnswers}
          saveAnswer={boundSaveAnswer}
          submitQuiz={boundSubmit}
          submitLabel="Submit paper"
        />
      )}
    </main>
  );
}
