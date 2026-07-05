import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { getCompletedQuizzes } from "@/lib/dashboard";
import { getPapersForSubject, getSubjectById, isValidGrade, type PaperListItem } from "@/lib/papers";
import { AppShell } from "@/components/app-shell";
import { StepBreadcrumb } from "@/components/step-breadcrumb";

const SECTIONS: { key: keyof Awaited<ReturnType<typeof getPapersForSubject>>; label: string }[] = [
  { key: "provincial", label: "Provincial papers" },
  { key: "district", label: "District papers" },
  { key: "school", label: "School papers" },
];

const BUTTON_LABEL: Record<PaperListItem["status"], string> = {
  not_started: "Start",
  in_progress: "Resume",
  completed: "Retake",
};

export default async function SubjectPapersPage({
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

  // Medium is still a durable profile attribute (or the subject's own fixed
  // medium) — only grade is a free browsing choice in this flow.
  const medium = subject.fixedMedium ?? profile.medium;

  const [grouped, completedQuizzes] = await Promise.all([
    getPapersForSubject({ subjectId, grade, medium, studentId: appUser.id }),
    getCompletedQuizzes(appUser.id),
  ]);

  const hasAnyPapers = SECTIONS.some((section) => grouped[section.key].length > 0);

  return (
    <AppShell
      active="papers"
      studentName={appUser.name ?? appUser.email.split("@")[0]}
      grade={profile.grade}
      isActiveLearner={completedQuizzes.length > 0}
    >
      <StepBreadcrumb
        items={[{ label: `Grade ${grade}`, href: `/papers/grade/${grade}` }, { label: subject.name }]}
      />
      <h1 className="mt-2 mb-4 text-lg font-bold text-navy-900">{subject.name}</h1>

      {!hasAnyPapers ? (
        <div className="rounded-[10px] border border-app-border bg-white p-4 text-sm text-ink-secondary">
          No papers are available yet for Grade {grade} in your medium.
        </div>
      ) : (
        SECTIONS.map((section) => {
          const sectionPapers = grouped[section.key];
          if (sectionPapers.length === 0) return null;

          return (
            <div
              key={section.key}
              className="mb-4.5 overflow-hidden rounded-[10px] border border-app-border bg-white last:mb-0"
            >
              <div className="border-b border-app-border px-4.5 py-3.5 text-[13.5px] font-bold text-navy-900">
                {section.label}
              </div>
              {sectionPapers.map((paper) => (
                <div
                  key={paper.id}
                  className="flex items-center gap-3.5 border-b border-app-border px-4.5 py-3.5 last:border-b-0"
                >
                  <div className="flex-1">
                    <p className="m-0 text-sm font-semibold">{paper.title}</p>
                    <p className="m-0 mt-0.5 text-[12.5px] text-ink-secondary">
                      {paper.year ?? "Year unknown"}
                      {paper.source ? ` · ${paper.source}` : ""}
                    </p>
                  </div>
                  <Link
                    href={`/quiz/papers/${paper.id}`}
                    className="rounded-md border border-app-border px-4.5 py-2 text-[13px] font-semibold hover:bg-app-surface-muted"
                  >
                    {BUTTON_LABEL[paper.status]}
                  </Link>
                </div>
              ))}
            </div>
          );
        })
      )}
    </AppShell>
  );
}
