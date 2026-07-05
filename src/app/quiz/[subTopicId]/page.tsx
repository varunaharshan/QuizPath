import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { ensureSubTopicAttemptStarted, getExistingAnswers, getQuizForSubTopic } from "@/lib/quiz";
import { QuizForm } from "@/components/quiz-form";
import { saveSubTopicAnswer, submitSubTopicQuiz } from "./actions";

export default async function QuizPage({
  params,
}: {
  params: Promise<{ subTopicId: string }>;
}) {
  const { subTopicId } = await params;

  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  const { subTopic, questions } = await getQuizForSubTopic(subTopicId);
  if (!subTopic) {
    notFound();
  }

  // Marks the sub-topic quiz as "in progress" the moment the student opens
  // it (mirroring the paper flow), so navigating away without submitting and
  // coming back later resumes the same attempt with prior answers intact.
  const attemptId = await ensureSubTopicAttemptStarted(appUser.id, subTopicId);
  const existingAnswers = await getExistingAnswers(attemptId);

  const boundSaveAnswer = async (mcqId: string, selectedOption: number) => {
    "use server";
    await saveSubTopicAnswer(attemptId, mcqId, selectedOption);
  };
  const boundSubmit = async () => {
    "use server";
    await submitSubTopicQuiz(subTopicId, attemptId);
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 p-8">
      <div>
        <Link href="/quiz" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
          ← Choose a different sub-topic
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{subTopic.name}</h1>
      </div>

      {questions.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">
          No questions are available for this sub-topic yet.
        </p>
      ) : (
        <QuizForm
          questions={questions}
          initialAnswers={existingAnswers}
          saveAnswer={boundSaveAnswer}
          submitQuiz={boundSubmit}
          submitLabel="Submit quiz"
        />
      )}
    </main>
  );
}
