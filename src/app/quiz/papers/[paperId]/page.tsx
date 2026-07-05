import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { ensurePaperAttemptStarted, getExistingAnswers, getQuizForPaper } from "@/lib/quiz";
import { getCompletedQuizzes, getSubTopicStatusesForGrade } from "@/lib/dashboard";
import { AppShell } from "@/components/app-shell";
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

  const [statuses, completedQuizzes] = await Promise.all([
    getSubTopicStatusesForGrade(appUser.id, profile.grade),
    getCompletedQuizzes(appUser.id),
  ]);
  const practiceCount = statuses.filter((s) => s.label !== "mastered").length;

  const boundSaveAnswer = async (mcqId: string, selectedOption: number) => {
    "use server";
    await savePaperAnswer(attemptId, mcqId, selectedOption);
  };
  const boundSubmit = async () => {
    "use server";
    await submitPaperQuiz(paperId, attemptId);
  };

  return (
    <AppShell
      active="practice"
      studentName={appUser.name ?? appUser.email.split("@")[0]}
      grade={profile.grade}
      practiceCount={practiceCount}
      isActiveLearner={completedQuizzes.length > 0}
    >
      <div className="mb-4">
        <Link
          href={`/quiz/grade/${paper.grade}/subjects/${paper.subjectId}`}
          className="text-[13px] text-ink-secondary hover:underline"
        >
          ← Choose a different paper
        </Link>
        <h1 className="mt-2 text-lg font-bold text-navy-900">{paper.title}</h1>
      </div>

      {questions.length === 0 ? (
        <p className="text-sm text-ink-secondary">No questions are available for this paper yet.</p>
      ) : (
        <QuizForm
          questions={questions}
          initialAnswers={existingAnswers}
          saveAnswer={boundSaveAnswer}
          submitQuiz={boundSubmit}
          submitLabel="Submit paper"
        />
      )}
    </AppShell>
  );
}
