import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { quizAttempts, subTopics } from "@/db/schema";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { masteryLabelForScore, type MasteryLabel } from "@/lib/quiz";

const MASTERY_LABEL_TEXT: Record<MasteryLabel, string> = {
  needs_work: "Needs work",
  in_progress: "In progress",
  mastered: "Mastered",
};

export default async function QuizResultsPage({
  params,
}: {
  params: Promise<{ subTopicId: string; attemptId: string }>;
}) {
  const { subTopicId, attemptId } = await params;

  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/sign-in");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  const attempt = await db.query.quizAttempts.findFirst({
    where: eq(quizAttempts.id, attemptId),
  });
  if (!attempt || attempt.studentId !== appUser.id || attempt.subTopicId !== subTopicId) {
    notFound();
  }

  const subTopic = await db.query.subTopics.findFirst({
    where: eq(subTopics.id, subTopicId),
  });

  const scoreNum = Number(attempt.score ?? 0);
  const label = masteryLabelForScore(scoreNum);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{subTopic?.name}</p>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight">{scoreNum}%</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">{MASTERY_LABEL_TEXT[label]}</p>
      </div>

      <div className="flex gap-3">
        <Link
          href={`/quiz/${subTopicId}`}
          className="rounded-full border border-black/10 px-5 py-2.5 text-sm font-medium hover:bg-black/[.04] dark:border-white/15 dark:hover:bg-white/[.06]"
        >
          Retake this quiz
        </Link>
        <Link
          href="/dashboard"
          className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
