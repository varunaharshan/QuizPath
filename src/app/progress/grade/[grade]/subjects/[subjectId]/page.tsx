import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { getCompletedQuizzes, getProgressStats, type SubTopicStatusLabel } from "@/lib/dashboard";
import { getSubjectById, isValidGrade } from "@/lib/papers";
import { AppShell } from "@/components/app-shell";
import { StepBreadcrumb } from "@/components/step-breadcrumb";

const BAR_COLOR: Record<SubTopicStatusLabel, string> = {
  mastered: "bg-mastered",
  in_progress: "bg-progress",
  needs_work: "bg-warn",
  not_started: "bg-app-surface-muted",
};

const SCORE_TEXT_COLOR: Record<SubTopicStatusLabel, string> = {
  mastered: "text-mastered",
  in_progress: "text-progress",
  needs_work: "text-warn",
  not_started: "text-ink-muted",
};

export default async function ProgressTopicsPage({
  params,
}: {
  params: Promise<{ grade: string; subjectId: string }>;
}) {
  const { grade, subjectId } = await params;
  if (!isValidGrade(grade)) {
    notFound();
  }

  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  const subject = await getSubjectById(subjectId);
  if (!subject) {
    notFound();
  }

  const [stats, completedQuizzes] = await Promise.all([
    getProgressStats(appUser.id, grade, subjectId),
    getCompletedQuizzes(appUser.id),
  ]);

  return (
    <AppShell
      active="progress"
      studentName={appUser.name ?? appUser.email.split("@")[0]}
      grade={profile.grade}
      isActiveLearner={completedQuizzes.length > 0}
    >
      <StepBreadcrumb
        items={[{ label: `Grade ${grade}`, href: `/progress/grade/${grade}` }, { label: subject.name }]}
      />
      <h1 className="mt-2 mb-4 text-lg font-bold text-navy-900">{subject.name}</h1>

      {stats.quizzesCompleted === 0 ? (
        <div className="rounded-[10px] border border-app-border bg-white p-4 text-sm text-ink-secondary">
          You haven&apos;t tried any Grade {grade} {subject.name} papers yet —{" "}
          <Link
            href={`/papers?grade=${grade}&subjectId=${subjectId}`}
            className="font-medium text-progress underline"
          >
            head to Papers
          </Link>{" "}
          to get started.
        </div>
      ) : (
        <>
          <div className="mb-4.5 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
            <div className="rounded-[10px] border border-app-border border-t-[3px] border-t-progress bg-white p-4">
              <p className="m-0 mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
                Quizzes completed
              </p>
              <p className="m-0 text-[24px] font-bold text-progress">{stats.quizzesCompleted}</p>
            </div>
            <div className="rounded-[10px] border border-app-border border-t-[3px] border-t-teal bg-white p-4">
              <p className="m-0 mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
                Total questions answered
              </p>
              <p className="m-0 text-[24px] font-bold text-teal">{stats.totalQuestionsAnswered}</p>
            </div>
            <div className="rounded-[10px] border border-app-border border-t-[3px] border-t-mastered bg-white p-4">
              <p className="m-0 mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
                Total correct answers
              </p>
              <p className="m-0 text-[24px] font-bold text-mastered">{stats.totalCorrectAnswers}</p>
            </div>
            <div className="rounded-[10px] border border-app-border border-t-[3px] border-t-warn bg-white p-4">
              <p className="m-0 mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
                Average score
              </p>
              <p className="m-0 text-[24px] font-bold text-warn">
                {stats.averageScore === null ? "—" : `${Math.round(stats.averageScore)}%`}
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
            <div className="border-b border-app-border px-4.5 py-3.5 text-[13.5px] font-bold text-navy-900">
              Mastery by topic
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="bg-app-surface-muted text-left text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
                    <th className="px-3.5 py-2.5">#</th>
                    <th className="px-3.5 py-2.5">Topic</th>
                    <th className="px-3.5 py-2.5">Progress</th>
                    <th className="px-3.5 py-2.5 text-right">Questions</th>
                    <th className="px-3.5 py-2.5 text-right">Correct</th>
                    <th className="px-3.5 py-2.5 text-right">Score</th>
                    <th className="px-3.5 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {stats.topics.map((topic, index) => (
                    <tr key={topic.id} className="border-b border-app-border last:border-b-0">
                      <td className="px-3.5 py-2.5 font-semibold text-ink-muted">{index + 1}</td>
                      <td className="px-3.5 py-2.5 min-w-[180px] font-semibold">{topic.name}</td>
                      <td className="px-3.5 py-2.5">
                        <div className="h-[7px] w-40 overflow-hidden rounded-full bg-app-surface-muted">
                          <div
                            className={`h-full rounded-full ${BAR_COLOR[topic.label]}`}
                            style={{ width: `${topic.score ?? 0}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-ink-secondary">{topic.questionsAnswered}</td>
                      <td className="px-3.5 py-2.5 text-right text-ink-secondary">{topic.correctCount}</td>
                      <td className={`px-3.5 py-2.5 text-right font-bold ${SCORE_TEXT_COLOR[topic.label]}`}>
                        {topic.score === null ? "—" : `${topic.score}%`}
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        <Link
                          href={`/quiz/${topic.id}`}
                          className="rounded-md border border-app-border bg-white px-3.5 py-1.5 text-[12.5px] font-semibold hover:bg-app-surface-muted"
                        >
                          Practice
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
