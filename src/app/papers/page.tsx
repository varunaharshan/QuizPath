import { redirect } from "next/navigation";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { getCompletedQuizzes } from "@/lib/dashboard";
import {
  firstNonEmptyPaperType,
  getPapersForSubject,
  getPracticeSubjects,
  getSubjectById,
  isValidGrade,
  isValidPaperType,
  PAPER_TYPE_LABELS,
  type PaperTypeValue,
} from "@/lib/papers";
import { AppShell } from "@/components/app-shell";
import { PapersFilterForm } from "@/components/papers-filter-form";

const GRADES = [
  { value: "10", label: "Grade 10" },
  { value: "11", label: "Grade 11" },
] as const;

const PAPER_TYPE_OPTIONS = (Object.keys(PAPER_TYPE_LABELS) as PaperTypeValue[]).map((value) => ({
  value,
  label: `${PAPER_TYPE_LABELS[value]} papers`,
}));

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
  const rawSubjectId = typeof params.subjectId === "string" ? params.subjectId : undefined;
  const rawType = typeof params.type === "string" ? params.type : undefined;
  const rawPaperId = typeof params.paper === "string" ? params.paper : undefined;

  // All four filter values are free query-string choices (like the old
  // Grade/Subject route params were) — this is a filter form's current
  // selection, not an identity-bearing URL, so anything invalid just falls
  // back to a sane default instead of 404ing.
  const grade = rawGrade && isValidGrade(rawGrade) ? rawGrade : profile.grade;

  const [subjects, completedQuizzes] = await Promise.all([
    getPracticeSubjects(),
    getCompletedQuizzes(appUser.id),
  ]);

  const subjectId =
    rawSubjectId && subjects.some((s) => s.id === rawSubjectId) ? rawSubjectId : (subjects[0]?.id ?? null);
  const subject = subjectId ? await getSubjectById(subjectId) : null;
  const medium = subject?.fixedMedium ?? profile.medium;

  const grouped = subjectId
    ? await getPapersForSubject({ subjectId, grade, medium, studentId: appUser.id })
    : { provincial: [], district: [], school: [] };

  const type = rawType && isValidPaperType(rawType) ? rawType : firstNonEmptyPaperType(grouped);
  const papersForType = grouped[type];
  const hasAnyPapers = grouped.provincial.length > 0 || grouped.district.length > 0 || grouped.school.length > 0;

  return (
    <AppShell
      active="papers"
      studentName={appUser.name ?? appUser.email.split("@")[0]}
      grade={profile.grade}
      isActiveLearner={completedQuizzes.length > 0}
    >
      <h1 className="m-0 mb-1 text-lg font-bold text-navy-900">Past Papers</h1>
      <p className="m-0 mb-4.5 text-[13px] text-ink-secondary">
        Practice with real past exam papers, organised by year.
      </p>

      {!subjectId ? (
        <div className="max-w-[640px] rounded-[10px] border border-app-border bg-white p-4 text-sm text-ink-secondary">
          No subjects are available yet.
        </div>
      ) : !hasAnyPapers ? (
        <div className="max-w-[640px] rounded-[10px] border border-app-border bg-white p-4 text-sm text-ink-secondary">
          No papers are available yet for Grade {grade} in your medium.
        </div>
      ) : (
        <PapersFilterForm
          grades={GRADES.map((g) => ({ ...g }))}
          subjects={subjects}
          paperTypes={PAPER_TYPE_OPTIONS}
          papers={papersForType}
          selected={{ grade, subjectId, type, paperId: rawPaperId ?? null }}
        />
      )}
    </AppShell>
  );
}
