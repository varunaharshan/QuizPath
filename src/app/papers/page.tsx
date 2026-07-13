import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { getCompletedQuizzes } from "@/lib/dashboard";
import { getGradesWithPapers, getPapersForGrade, groupPapersBySubject } from "@/lib/papers";
import { getGrades, getPaperTypes, isValidGrade, labelForGrade, labelForPaperType } from "@/lib/reference-data";
import { AppShell } from "@/components/app-shell";
import { PapersGrid } from "@/components/papers-grid";

// Medium is a fixed 3-value language, not an admin-extensible reference
// table like Grade/Paper Type (see CLAUDE.md "Reference Data") — nothing in
// this feature asked for a 4th/5th medium to become addable, so this is a
// plain local list, same as onboarding/profile's own hardcoded options.
const MEDIUM_OPTIONS = [
  { value: "sinhala", label: "Sinhala" },
  { value: "tamil", label: "Tamil" },
  { value: "english", label: "English" },
] as const;

function isValidMedium(value: string | undefined): value is "sinhala" | "tamil" | "english" {
  return value === "sinhala" || value === "tamil" || value === "english";
}

export default async function PapersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  const params = await searchParams;
  const rawGrade = typeof params.grade === "string" ? params.grade : undefined;
  const rawMedium = typeof params.medium === "string" ? params.medium : undefined;

  const [allGrades, allPaperTypes, grades, completedQuizzes] = await Promise.all([
    getGrades(),
    getPaperTypes(),
    getGradesWithPapers(),
    getCompletedQuizzes(appUser.id),
  ]);

  // Grade is a free browsing choice (like every other cascading filter in
  // this app) — invalid/missing falls back to the student's own grade
  // rather than 404ing, even if that grade happens to have zero papers.
  const grade = rawGrade && isValidGrade(rawGrade, allGrades) ? rawGrade : profile.grade;

  // Medium is a default, not a restriction — it defaults to the student's
  // own profile medium, but is a real, freely overridable ?medium= choice,
  // same free-browsing rule Grade already has. A subject with a
  // fixedMedium (e.g. English) always shows regardless of which medium is
  // picked here — see getPapersForGrade in src/lib/papers.ts.
  const medium = isValidMedium(rawMedium) ? rawMedium : profile.medium;

  const papersForGrade = await getPapersForGrade({ grade, medium, studentId: appUser.id });

  const groups = groupPapersBySubject(papersForGrade);

  return (
    <AppShell
      active="papers"
      studentName={appUser.name ?? appUser.email.split("@")[0]}
      grade={profile.grade}
      isActiveLearner={completedQuizzes.length > 0}
    >
      <h1 className="m-0 mb-1 text-lg font-bold text-navy-900">Past Papers</h1>
      <p className="m-0 mb-4.5 text-[13px] text-ink-secondary">
        Practice with real past exam papers, organised by subject.
      </p>

      {grades.length === 0 ? (
        <div className="max-w-[640px] rounded-[10px] border border-app-border bg-white p-4 text-sm text-ink-secondary">
          No papers are available yet.
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {grades.map((g) => (
              <Link
                key={g}
                href={`/papers?grade=${g}&medium=${medium}`}
                className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                  g === grade
                    ? "bg-navy-900 text-white"
                    : "bg-app-surface-muted text-ink-secondary hover:bg-app-border"
                }`}
              >
                {labelForGrade(g, allGrades)}
              </Link>
            ))}
          </div>

          <div className="mb-4.5 flex flex-wrap gap-2">
            {MEDIUM_OPTIONS.map((m) => (
              <Link
                key={m.value}
                href={`/papers?grade=${grade}&medium=${m.value}`}
                className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                  m.value === medium
                    ? "bg-navy-900 text-white"
                    : "bg-app-surface-muted text-ink-secondary hover:bg-app-border"
                }`}
              >
                {m.label}
              </Link>
            ))}
          </div>

          {groups.length === 0 ? (
            <div className="max-w-[640px] rounded-[10px] border border-app-border bg-white p-4 text-sm text-ink-secondary">
              No papers are available yet for Grade {grade} in{" "}
              {MEDIUM_OPTIONS.find((m) => m.value === medium)?.label ?? medium} medium.
            </div>
          ) : (
            <PapersGrid
              grade={grade}
              medium={medium}
              groups={groups.map((group) => ({
                subjectId: group.subjectId,
                subjectName: group.subjectName,
                papers: group.papers.map((p) => ({
                  id: p.id,
                  title: p.title,
                  mediumLabel: MEDIUM_OPTIONS.find((m) => m.value === p.medium)?.label ?? p.medium,
                  paperTypeLabel: labelForPaperType(p.paperType, allPaperTypes),
                  year: p.year,
                  questionCount: p.questionCount,
                  totalMarks: p.totalMarks,
                  timeLimitMinutes: p.timeLimitMinutes,
                  status: p.status,
                  answeredCount: p.answeredCount,
                })),
              }))}
            />
          )}
        </>
      )}
    </AppShell>
  );
}
