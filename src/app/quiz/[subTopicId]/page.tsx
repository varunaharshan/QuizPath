import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { ensureSubTopicAttemptStarted, getExistingAnswers, getQuizForSubTopic } from "@/lib/quiz";
import { getCompletedQuizzes } from "@/lib/dashboard";
import { AppShell } from "@/components/app-shell";
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

  const completedQuizzes = await getCompletedQuizzes(appUser.id);

  const boundSaveAnswer = async (mcqId: string, selectedOption: number) => {
    "use server";
    await saveSubTopicAnswer(attemptId, mcqId, selectedOption);
  };
  const boundSubmit = async () => {
    "use server";
    await submitSubTopicQuiz(subTopicId, attemptId);
  };

  return (
    <AppShell
      active="practice"
      studentName={appUser.name ?? appUser.email.split("@")[0]}
      grade={profile.grade}
      isActiveLearner={completedQuizzes.length > 0}
    >
      <div className="-m-7 min-h-full bg-white p-7">
        <div className="mb-4">
          <Link href="/papers" className="text-[13px] text-quiz-grey-text hover:underline">
            ← Choose a different sub-topic
          </Link>
          <h1 className="mt-2 text-lg font-bold text-quiz-navy">{subTopic.name}</h1>
        </div>

        {questions.length === 0 ? (
          <p className="text-sm text-quiz-grey-text">No questions are available for this sub-topic yet.</p>
        ) : (
          <QuizForm
            questions={questions}
            initialAnswers={existingAnswers}
            saveAnswer={boundSaveAnswer}
            submitQuiz={boundSubmit}
            submitLabel="Submit quiz"
          />
        )}
      </div>
    </AppShell>
  );
}
