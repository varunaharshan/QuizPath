import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { getCompletedQuizzes } from "@/lib/dashboard";
import { getGradesWithPapers, getPapersForGrade, groupPapersBySubject, isValidGrade } from "@/lib/papers";
import { AppShell } from "@/components/app-shell";
import { PapersGrid } from "@/components/papers-grid";

const GRADE_LABELS: Record<string, string> = { "10": "Grade 10", "11": "Grade 11" };

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

  // Grade is a free browsing choice (like every other cascading filter in
  // this app) — invalid/missing falls back to the student's own grade
  // rather than 404ing, even if that grade happens to have zero papers.
  const grade = rawGrade && isValidGrade(rawGrade) ? rawGrade : profile.grade;

  const [grades, papersForGrade, completedQuizzes] = await Promise.all([
    getGradesWithPapers(),
    getPapersForGrade({ grade, studentMedium: profile.medium, studentId: appUser.id }),
    getCompletedQuizzes(appUser.id),
  ]);

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
          <div className="mb-4.5 flex flex-wrap gap-2">
            {grades.map((g) => (
              <Link
                key={g}
                href={`/papers?grade=${g}`}
                className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                  g === grade
                    ? "bg-navy-900 text-white"
                    : "bg-app-surface-muted text-ink-secondary hover:bg-app-border"
                }`}
              >
                {GRADE_LABELS[g]}
              </Link>
            ))}
          </div>

          {groups.length === 0 ? (
            <div className="max-w-[640px] rounded-[10px] border border-app-border bg-white p-4 text-sm text-ink-secondary">
              No papers are available yet for Grade {grade} in your medium.
            </div>
          ) : (
            <PapersGrid
              grade={grade}
              groups={groups.map((group) => ({
                subjectId: group.subjectId,
                subjectName: group.subjectName,
                papers: group.papers.map((p) => ({
                  id: p.id,
                  title: p.title,
                  paperType: p.paperType,
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
