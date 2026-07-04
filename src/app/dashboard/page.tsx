import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import {
  getCompletedQuizzes,
  getContinueSubTopic,
  getSubTopicStatusesForGrade,
  iconForModule,
  type SubTopicStatus,
} from "@/lib/dashboard";
import { AppShell } from "@/components/app-shell";

const STATUS_META: Record<
  SubTopicStatus["label"],
  { icon: string; iconClass: string; text: (score: number | null) => string }
> = {
  mastered: { icon: "✓", iconClass: "text-mastered", text: (s) => `Mastered · ${s}%` },
  in_progress: { icon: "●", iconClass: "text-progress", text: (s) => `In progress · ${s}%` },
  needs_work: { icon: "⚠", iconClass: "text-warn", text: (s) => `Needs work · ${s}%` },
  not_started: { icon: "○", iconClass: "text-ink-muted", text: () => "Not started" },
};

export default async function DashboardPage() {
  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  const [statuses, continueSubTopic, completedQuizzes] = await Promise.all([
    getSubTopicStatusesForGrade(appUser.id, profile.grade),
    getContinueSubTopic(appUser.id),
    getCompletedQuizzes(appUser.id),
  ]);

  const practiceCount = statuses.filter((s) => s.label !== "mastered").length;

  const statusesByModule = new Map<string, SubTopicStatus[]>();
  for (const status of statuses) {
    const list = statusesByModule.get(status.moduleName) ?? [];
    list.push(status);
    statusesByModule.set(status.moduleName, list);
  }

  return (
    <AppShell
      active="dashboard"
      studentName={appUser.name ?? appUser.email.split("@")[0]}
      grade={profile.grade}
      practiceCount={practiceCount}
      isActiveLearner={completedQuizzes.length > 0}
    >
      <div className="mb-4.5 overflow-hidden rounded-[10px] border border-app-border bg-white">
        <div className="border-b border-app-border px-4.5 py-3.5 text-[13.5px] font-bold text-navy-900">
          Continue where you left off
        </div>
        <div className="p-4">
          {continueSubTopic ? (
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-app-surface-muted text-lg">
                {iconForModule(continueSubTopic.moduleName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-sm font-semibold">{continueSubTopic.subTopicName}</p>
                <p className="m-0 mt-0.5 text-[12.5px] text-ink-secondary">
                  {continueSubTopic.moduleName} ·{" "}
                  {STATUS_META[continueSubTopic.label].text(continueSubTopic.score)}
                </p>
              </div>
              <Link
                href={`/quiz/${continueSubTopic.subTopicId}`}
                className="rounded-md bg-navy-900 px-4.5 py-2 text-[13px] font-semibold text-white hover:bg-navy-800"
              >
                Retake
              </Link>
            </div>
          ) : (
            <p className="text-sm text-ink-secondary">
              No quizzes yet.{" "}
              <Link href="/quiz" className="font-medium text-progress underline">
                Pick a sub-topic
              </Link>{" "}
              to get started.
            </p>
          )}
        </div>
      </div>

      <div className="mb-4.5 overflow-hidden rounded-[10px] border border-app-border bg-white">
        <div className="border-b border-app-border px-4.5 py-3.5 text-[13.5px] font-bold text-navy-900">
          Progress by sub-topic
        </div>
        <div className="p-4">
          {[...statusesByModule.entries()].map(([moduleName, moduleStatuses], index) => (
            <div key={moduleName} className={index > 0 ? "mt-4" : ""}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-secondary">
                {moduleName}
              </p>
              <div className="flex flex-col gap-2">
                {moduleStatuses.map((status) => {
                  const meta = STATUS_META[status.label];
                  return (
                    <div
                      key={status.id}
                      className="flex items-center gap-3 rounded-md bg-app-surface-muted px-3.5 py-2.5"
                    >
                      <span className={`w-[18px] shrink-0 text-[15px] ${meta.iconClass}`}>
                        {meta.icon}
                      </span>
                      <span className="flex-1 text-[13px]">{status.name}</span>
                      <span className="text-xs text-ink-secondary">
                        {meta.text(status.score)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
        <div className="border-b border-app-border px-4.5 py-3.5 text-[13.5px] font-bold text-navy-900">
          Completed quizzes
        </div>
        {completedQuizzes.length === 0 ? (
          <p className="p-4 text-sm text-ink-secondary">
            You haven&apos;t completed any quizzes yet.
          </p>
        ) : (
          <div>
            <div className="flex bg-app-surface-muted px-4.5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
              <div className="flex-1">Sub-topic</div>
              <div className="w-[90px]">Date</div>
              <div className="w-[90px] text-right">Score</div>
            </div>
            {completedQuizzes.map((quiz) => (
              <div
                key={quiz.attemptId}
                className="flex items-center border-t border-app-border px-4.5 py-2.5 text-[13px]"
              >
                <div className="flex-1">{quiz.title}</div>
                <div className="w-[90px] text-ink-secondary">
                  {quiz.completedAt.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </div>
                <div className="w-[90px] text-right font-bold">
                  {quiz.correctCount}/{quiz.total}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
