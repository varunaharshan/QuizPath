import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { getCompletedQuizzes, getSubTopicStatusesForGrade, iconForModule } from "@/lib/dashboard";
import { AppShell } from "@/components/app-shell";

const STATUS_META = {
  mastered: { text: (s: number | null) => `Mastered · ${s}%`, buttonLabel: "Retake" },
  in_progress: { text: (s: number | null) => `In progress · ${s}%`, buttonLabel: "Retake" },
  needs_work: { text: (s: number | null) => `Needs work · ${s}%`, buttonLabel: "Retake" },
  not_started: { text: () => "Not started", buttonLabel: "Start" },
} as const;

export default async function PracticePage() {
  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  const [statuses, completedQuizzes] = await Promise.all([
    getSubTopicStatusesForGrade(appUser.id, profile.grade),
    getCompletedQuizzes(appUser.id),
  ]);

  const practiceCount = statuses.filter((s) => s.label !== "mastered").length;

  return (
    <AppShell
      active="practice"
      studentName={appUser.name ?? appUser.email.split("@")[0]}
      grade={profile.grade}
      practiceCount={practiceCount}
      isActiveLearner={completedQuizzes.length > 0}
    >
      <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
        <div className="border-b border-app-border px-4.5 py-3.5 text-[13.5px] font-bold text-navy-900">
          Choose a sub-topic to practice
        </div>
        {statuses.map((status) => {
          const meta = STATUS_META[status.label];
          return (
            <div
              key={status.id}
              className="flex items-center gap-3.5 border-b border-app-border px-4.5 py-3.5 last:border-b-0"
            >
              <div className="w-[30px] shrink-0 text-lg">{iconForModule(status.moduleName)}</div>
              <div className="flex-1">
                <p className="m-0 text-sm font-semibold">{status.name}</p>
                <p className="m-0 mt-0.5 text-[12.5px] text-ink-secondary">
                  {status.moduleName} · {meta.text(status.score)}
                </p>
              </div>
              <Link
                href={`/quiz/${status.id}`}
                className="rounded-md border border-app-border px-4.5 py-2 text-[13px] font-semibold hover:bg-app-surface-muted"
              >
                {meta.buttonLabel}
              </Link>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
