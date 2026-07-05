import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { getCompletedQuizzes } from "@/lib/dashboard";
import { AppShell } from "@/components/app-shell";

const GRADES = ["10", "11"] as const;

// Progress mirrors Practice's own Grade -> Subject -> ... flow exactly (same
// step order, same "Your grade" default emphasis, same free-browsing-choice
// rule) rather than inventing a different navigation shape for the same two
// grades — see src/app/quiz/page.tsx.
export default async function ProgressGradePage() {
  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  const completedQuizzes = await getCompletedQuizzes(appUser.id);

  return (
    <AppShell
      active="progress"
      studentName={appUser.name ?? appUser.email.split("@")[0]}
      grade={profile.grade}
      isActiveLearner={completedQuizzes.length > 0}
    >
      <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
        <div className="border-b border-app-border px-4.5 py-3.5 text-[13.5px] font-bold text-navy-900">
          Choose a grade to view progress
        </div>
        {GRADES.map((grade) => {
          const isOwnGrade = grade === profile.grade;
          return (
            <Link
              key={grade}
              href={`/progress/grade/${grade}`}
              className="flex items-center justify-between border-b border-app-border px-4.5 py-3.5 text-sm font-semibold last:border-b-0 hover:bg-app-surface-muted"
            >
              <span className="flex items-center gap-2.5">
                Grade {grade}
                {isOwnGrade && (
                  <span className="rounded-full bg-progress-bg px-2.5 py-0.5 text-[11px] font-semibold text-progress">
                    Your grade
                  </span>
                )}
              </span>
              <span aria-hidden className="text-ink-secondary">
                →
              </span>
            </Link>
          );
        })}
      </div>
      <p className="mt-3 text-[12.5px] text-ink-secondary">
        Viewing a different grade here is just for browsing progress — it won&apos;t change your
        profile grade.
      </p>
    </AppShell>
  );
}
