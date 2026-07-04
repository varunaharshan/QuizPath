import { redirect } from "next/navigation";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import {
  getCompletedQuizzes,
  getProgressStats,
  getSubTopicStatusesForGrade,
  type SubTopicStatusLabel,
} from "@/lib/dashboard";
import { AppShell } from "@/components/app-shell";

const BAR_COLOR: Record<SubTopicStatusLabel, string> = {
  mastered: "bg-mastered",
  in_progress: "bg-progress",
  needs_work: "bg-warn",
  not_started: "bg-app-surface-muted",
};

export default async function ProgressPage() {
  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  const [stats, statuses, completedQuizzes] = await Promise.all([
    getProgressStats(appUser.id, profile.grade),
    getSubTopicStatusesForGrade(appUser.id, profile.grade),
    getCompletedQuizzes(appUser.id),
  ]);

  const practiceCount = statuses.filter((s) => s.label !== "mastered").length;

  return (
    <AppShell
      active="progress"
      studentName={appUser.name ?? appUser.email.split("@")[0]}
      grade={profile.grade}
      practiceCount={practiceCount}
      isActiveLearner={completedQuizzes.length > 0}
    >
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
            Sub-topics mastered
          </p>
          <p className="m-0 text-[22px] font-bold text-navy-900">
            {stats.masteredCount} of {stats.totalSubTopics}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
        <div className="border-b border-app-border px-4.5 py-3.5 text-[13.5px] font-bold text-navy-900">
          Mastery by sub-topic
        </div>
        <div className="p-4">
          {stats.subTopicBars.map((bar) => (
            <div key={bar.name} className="mb-2.5 flex items-center gap-3 last:mb-0">
              <div className="w-[170px] shrink-0 truncate text-[12.5px] text-ink-secondary">
                {bar.name}
              </div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-app-surface-muted">
                <div
                  className={`h-full rounded-full ${BAR_COLOR[bar.label]}`}
                  style={{ width: `${bar.score ?? 0}%` }}
                />
              </div>
              <div className="w-9 shrink-0 text-right text-[12.5px] font-bold">
                {bar.score === null ? "—" : `${bar.score}%`}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
