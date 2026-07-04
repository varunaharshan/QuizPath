import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import {
  getCompletedQuizzes,
  getProgressStats,
  getSubTopicStatusesForGrade,
  type SubTopicStatusLabel,
} from "@/lib/dashboard";
import { getSubjectById, isValidGrade } from "@/lib/papers";
import { AppShell } from "@/components/app-shell";
import { StepBreadcrumb } from "@/components/step-breadcrumb";

const BAR_COLOR: Record<SubTopicStatusLabel, string> = {
  mastered: "bg-mastered",
  in_progress: "bg-progress",
  needs_work: "bg-warn",
  not_started: "bg-app-surface-muted",
};

function confidenceNote(score: number | null, questionsAnswered: number): string {
  if (score === null) return "Not started";
  const questionWord = questionsAnswered === 1 ? "question" : "questions";
  return `${score}% · ${questionsAnswered} ${questionWord} answered`;
}

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

  const [stats, statuses, completedQuizzes] = await Promise.all([
    getProgressStats(appUser.id, grade, subjectId),
    getSubTopicStatusesForGrade(appUser.id, profile.grade),
    getCompletedQuizzes(appUser.id),
  ]);

  const practiceCount = statuses.filter((s) => s.label !== "mastered").length;
  const weakTopics = stats.subTopicBars.filter((bar) => bar.label === "needs_work");

  return (
    <AppShell
      active="progress"
      studentName={appUser.name ?? appUser.email.split("@")[0]}
      grade={profile.grade}
      practiceCount={practiceCount}
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
            href={`/quiz/grade/${grade}/subjects/${subjectId}`}
            className="font-medium text-progress underline"
          >
            head to Practice
          </Link>{" "}
          to get started.
        </div>
      ) : (
        <>
          <div className="mb-4.5 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
            <div className="rounded-[10px] border border-app-border bg-white p-4">
              <p className="m-0 mb-1.5 text-[11.5px] font-bold uppercase tracking-wide text-ink-secondary">
                Quizzes completed
              </p>
              <p className="m-0 text-[22px] font-bold text-navy-900">{stats.quizzesCompleted}</p>
            </div>
            <div className="rounded-[10px] border border-app-border bg-white p-4">
              <p className="m-0 mb-1.5 text-[11.5px] font-bold uppercase tracking-wide text-ink-secondary">
                Average score
              </p>
              <p className="m-0 text-[22px] font-bold text-navy-900">
                {stats.averageScore === null ? "—" : `${Math.round(stats.averageScore)}%`}
              </p>
            </div>
            <div className="rounded-[10px] border border-app-border bg-white p-4">
              <p className="m-0 mb-1.5 text-[11.5px] font-bold uppercase tracking-wide text-ink-secondary">
                Topics mastered
              </p>
              <p className="m-0 text-[22px] font-bold text-navy-900">
                {stats.masteredCount} of {stats.totalSubTopics}
              </p>
            </div>
          </div>

          {weakTopics.length > 0 && (
            <div className="mb-4.5 overflow-hidden rounded-[10px] border border-warn bg-warn-bg">
              <div className="border-b border-warn px-4.5 py-3.5 text-[13.5px] font-bold text-navy-900">
                Topics that need work
              </div>
              <div>
                {weakTopics.map((topic) => (
                  <div
                    key={topic.id}
                    className="flex items-center gap-3.5 border-b border-warn px-4.5 py-3.5 last:border-b-0"
                  >
                    <div className="flex-1">
                      <p className="m-0 text-sm font-semibold">{topic.name}</p>
                      <p className="m-0 mt-0.5 text-[12.5px] text-ink-secondary">
                        {confidenceNote(topic.score, topic.questionsAnswered)}
                      </p>
                    </div>
                    <Link
                      href={`/quiz/${topic.id}`}
                      className="rounded-md border border-app-border bg-white px-4.5 py-2 text-[13px] font-semibold hover:bg-app-surface-muted"
                    >
                      Practice
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
            <div className="border-b border-app-border px-4.5 py-3.5 text-[13.5px] font-bold text-navy-900">
              Mastery by topic
            </div>
            <div className="p-4">
              {stats.subTopicBars.map((bar) => (
                <div key={bar.id} className="mb-2.5 flex items-center gap-3 last:mb-0">
                  <div className="w-[170px] shrink-0 truncate text-[12.5px] text-ink-secondary">
                    {bar.name}
                  </div>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-app-surface-muted">
                    <div
                      className={`h-full rounded-full ${BAR_COLOR[bar.label]}`}
                      style={{ width: `${bar.score ?? 0}%` }}
                    />
                  </div>
                  <div className="w-[150px] shrink-0 text-right text-[12.5px] font-bold">
                    {confidenceNote(bar.score, bar.questionsAnswered)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
