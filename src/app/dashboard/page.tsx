import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import {
  getCompletedQuizzes,
  getContinueAttempt,
  getProgressStats,
  getSubTopicStatusesForGrade,
  rankRecommendedPracticeTopics,
} from "@/lib/dashboard";
import { getPracticeSubjects } from "@/lib/papers";
import { AppShell } from "@/components/app-shell";

export default async function DashboardPage() {
  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  // Science is the only subject today (see CLAUDE.md "Single-tenant MVP") —
  // the Dashboard's snapshot/recommended-practice cards are scoped to it the
  // same way Progress is, rather than blending every subject together.
  const subjects = await getPracticeSubjects();
  const subject = subjects[0] as { id: string; name: string } | undefined;

  const [statuses, continueAttempt, completedQuizzes, stats] = await Promise.all([
    getSubTopicStatusesForGrade(appUser.id, profile.grade),
    getContinueAttempt(appUser.id, profile.grade),
    getCompletedQuizzes(appUser.id, { grade: profile.grade, limit: 3 }),
    subject ? getProgressStats(appUser.id, profile.grade, subject.id) : null,
  ]);

  const practiceCount = statuses.filter((s) => s.label !== "mastered").length;
  const recommended = stats ? rankRecommendedPracticeTopics(stats.topics, 2) : [];
  const progressHref = subject
    ? `/progress/grade/${profile.grade}/subjects/${subject.id}`
    : "/progress";
  const displayName = appUser.name ?? appUser.email.split("@")[0];
  const firstName = displayName.split(" ")[0];

  return (
    <AppShell
      active="dashboard"
      studentName={displayName}
      grade={profile.grade}
      practiceCount={practiceCount}
      isActiveLearner={completedQuizzes.length > 0}
    >
      <h1 className="m-0 mb-1 text-lg font-bold text-navy-900">Welcome back, {firstName}</h1>
      <p className="m-0 mb-4.5 text-[13px] text-ink-secondary">
        Grade {profile.grade} · {subject?.name ?? "Science"}
      </p>

      <div className="mb-4.5 overflow-hidden rounded-[10px] border border-app-border bg-white">
        <div className="border-b border-app-border px-4.5 py-3.5 text-[13.5px] font-bold text-navy-900">
          Continue where you left off
        </div>
        <div className="p-4">
          {continueAttempt ? (
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-app-surface-muted text-lg">
                {continueAttempt.type === "paper" ? "📄" : "✎"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-sm font-semibold">{continueAttempt.name}</p>
                <p className="m-0 mt-0.5 text-[12.5px] text-ink-secondary">
                  {continueAttempt.source} · {continueAttempt.questionsDone} of{" "}
                  {continueAttempt.totalQuestions} questions done
                </p>
                <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-app-surface-muted">
                  <div
                    className="h-full rounded-full bg-progress"
                    style={{
                      width: `${
                        continueAttempt.totalQuestions === 0
                          ? 0
                          : Math.round((continueAttempt.questionsDone / continueAttempt.totalQuestions) * 100)
                      }%`,
                    }}
                  />
                </div>
              </div>
              <Link
                href={
                  continueAttempt.type === "paper"
                    ? `/quiz/papers/${continueAttempt.id}`
                    : `/quiz/${continueAttempt.id}`
                }
                className="rounded-md bg-navy-900 px-4.5 py-2 text-[13px] font-semibold text-white hover:bg-navy-800"
              >
                Resume
              </Link>
            </div>
          ) : (
            <p className="m-0 text-sm text-ink-secondary">
              No in-progress quizzes.{" "}
              <Link href="/quiz" className="font-medium text-progress underline">
                Head to Practice
              </Link>{" "}
              to get started.
            </p>
          )}
        </div>
      </div>

      <div className="mb-4.5 overflow-hidden rounded-[10px] border border-app-border bg-white">
        <div className="flex items-center justify-between border-b border-app-border px-4.5 py-3.5 text-[13.5px] font-bold text-navy-900">
          Your snapshot
          <Link href={progressHref} className="text-[12.5px] font-semibold text-progress hover:underline">
            View full progress →
          </Link>
        </div>
        {stats ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3 p-4">
            <div className="rounded-md bg-app-surface-muted p-3.5">
              <p className="m-0 mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-secondary">
                Quizzes done
              </p>
              <p className="m-0 text-[20px] font-bold text-progress">{stats.quizzesCompleted}</p>
            </div>
            <div className="rounded-md bg-app-surface-muted p-3.5">
              <p className="m-0 mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-secondary">
                Questions answered
              </p>
              <p className="m-0 text-[20px] font-bold text-teal">{stats.totalQuestionsAnswered}</p>
            </div>
            <div className="rounded-md bg-app-surface-muted p-3.5">
              <p className="m-0 mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-secondary">
                Correct answers
              </p>
              <p className="m-0 text-[20px] font-bold text-mastered">{stats.totalCorrectAnswers}</p>
            </div>
            <div className="rounded-md bg-app-surface-muted p-3.5">
              <p className="m-0 mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-secondary">
                Average score
              </p>
              <p className="m-0 text-[20px] font-bold text-warn">
                {stats.averageScore === null ? "—" : `${Math.round(stats.averageScore)}%`}
              </p>
            </div>
          </div>
        ) : (
          <p className="p-4 text-sm text-ink-secondary">No snapshot available yet.</p>
        )}
      </div>

      <div className="mb-4.5 overflow-hidden rounded-[10px] border border-app-border bg-white">
        <div className="flex items-center justify-between border-b border-app-border px-4.5 py-3.5 text-[13.5px] font-bold text-navy-900">
          Recommended practice
          <Link href={progressHref} className="text-[12.5px] font-semibold text-progress hover:underline">
            See all topics →
          </Link>
        </div>
        <div className="p-4">
          {recommended.length === 0 ? (
            <p className="m-0 text-sm text-ink-secondary">
              Nothing needs extra practice right now — nice work!
            </p>
          ) : (
            recommended.map((topic, index) => (
              <div
                key={topic.id}
                className={`flex items-center justify-between py-2.5 ${
                  index > 0 ? "border-t border-app-border" : ""
                }`}
              >
                <div>
                  <p className="m-0 text-[13.5px] font-semibold">{topic.name}</p>
                  <p className="m-0 mt-0.5 text-xs text-warn">
                    {topic.score === null
                      ? "Not started yet"
                      : `${topic.score}% · ${topic.questionsAnswered} questions answered`}
                  </p>
                </div>
                <Link
                  href={`/quiz/${topic.id}`}
                  className="rounded-md border border-app-border bg-white px-3.5 py-1.5 text-[12.5px] font-semibold hover:bg-app-surface-muted"
                >
                  Practice
                </Link>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
        <div className="flex items-center justify-between border-b border-app-border px-4.5 py-3.5 text-[13.5px] font-bold text-navy-900">
          Recent activity
          {/* No dedicated full-history view yet — points at Progress for now (known gap). */}
          <Link href={progressHref} className="text-[12.5px] font-semibold text-progress hover:underline">
            View all →
          </Link>
        </div>
        <div className="p-4">
          {completedQuizzes.length === 0 ? (
            <p className="m-0 text-sm text-ink-secondary">You haven&apos;t completed any quizzes yet.</p>
          ) : (
            completedQuizzes.map((quiz, index) => (
              <div
                key={quiz.attemptId}
                className={`flex items-center py-2.5 text-[13px] ${
                  index > 0 ? "border-t border-app-border" : ""
                }`}
              >
                <div className="flex-1">
                  {quiz.type === "topic_practice" ? `Practice: ${quiz.title}` : quiz.title}
                </div>
                <div className="w-[80px] text-xs text-ink-secondary">
                  {quiz.completedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </div>
                <div className="w-[60px] text-right font-bold">
                  {quiz.correctCount}/{quiz.total}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
