import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { getCompletedQuizzes } from "@/lib/dashboard";
import { getPracticeSubjects, isValidGrade } from "@/lib/papers";
import { AppShell } from "@/components/app-shell";
import { StepBreadcrumb } from "@/components/step-breadcrumb";

export default async function PapersSubjectPage({
  params,
}: {
  params: Promise<{ grade: string }>;
}) {
  const { grade } = await params;
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

  const [completedQuizzes, subjects] = await Promise.all([
    getCompletedQuizzes(appUser.id),
    getPracticeSubjects(),
  ]);

  return (
    <AppShell
      active="papers"
      studentName={appUser.name ?? appUser.email.split("@")[0]}
      grade={profile.grade}
      isActiveLearner={completedQuizzes.length > 0}
    >
      <StepBreadcrumb items={[{ label: `Grade ${grade}` }]} />

      <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
        <div className="border-b border-app-border px-4.5 py-3.5 text-[13.5px] font-bold text-navy-900">
          Choose a subject
        </div>
        {subjects.map((subject) => (
          <Link
            key={subject.id}
            href={`/papers/grade/${grade}/subjects/${subject.id}`}
            className="flex items-center justify-between border-b border-app-border px-4.5 py-3.5 text-sm font-semibold last:border-b-0 hover:bg-app-surface-muted"
          >
            {subject.name}
            <span aria-hidden className="text-ink-secondary">
              →
            </span>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
