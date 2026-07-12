import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { getCompletedQuizzes } from "@/lib/dashboard";
import { getPaperOverview } from "@/lib/papers";
import { getPaperTypes, labelForPaperType } from "@/lib/reference-data";
import { AppShell } from "@/components/app-shell";

const BUTTON_LABEL: Record<"not_started" | "in_progress" | "completed", string> = {
  not_started: "Start test →",
  in_progress: "Resume test →",
  completed: "Retake test →",
};

// Read-only overview — deliberately never calls ensurePaperAttemptStarted
// (that's the quiz-taking route's own job, fired the moment that page
// loads); viewing this page must never itself mark a paper "in progress".
export default async function PaperOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ paperId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { paperId } = await params;

  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  const [overview, completedQuizzes, paperTypes] = await Promise.all([
    getPaperOverview({ paperId, studentId: appUser.id }),
    getCompletedQuizzes(appUser.id),
    getPaperTypes(),
  ]);
  if (!overview) {
    notFound();
  }

  const sp = await searchParams;
  const rawGrade = typeof sp.grade === "string" ? sp.grade : undefined;
  const rawSubjectId = typeof sp.subjectId === "string" ? sp.subjectId : undefined;

  // Preserves whichever grade/subject the student was browsing when they
  // opened this paper (the grid's own card links pass these along); falls
  // back to the paper's own grade/subject for a direct/bookmarked link.
  const backGrade = rawGrade ?? overview.grade;
  const backSubjectId = rawSubjectId ?? overview.subjectId;

  return (
    <AppShell
      active="papers"
      studentName={appUser.name ?? appUser.email.split("@")[0]}
      grade={profile.grade}
      isActiveLearner={completedQuizzes.length > 0}
    >
      <Link
        href={`/papers?grade=${backGrade}&subjectId=${backSubjectId}`}
        className="text-[13px] text-ink-secondary hover:underline"
      >
        ← Back to Papers
      </Link>

      <h1 className="m-0 mt-2 mb-1 text-lg font-bold text-navy-900">{overview.title}</h1>
      <p className="m-0 mb-4.5 text-[13px] text-ink-secondary">
        Grade {overview.grade} · {overview.subjectName} · {labelForPaperType(overview.paperType, paperTypes)}
        {overview.year ? ` · ${overview.year}` : ""}
      </p>

      <div className="mb-4.5 grid max-w-[640px] grid-cols-3 gap-3">
        <div className="rounded-[10px] border border-app-border border-t-[3px] border-t-progress bg-white p-4">
          <p className="m-0 mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-secondary">Questions</p>
          <p className="m-0 text-[24px] font-bold text-progress">{overview.questionCount}</p>
        </div>
        <div className="rounded-[10px] border border-app-border border-t-[3px] border-t-teal bg-white p-4">
          <p className="m-0 mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
            Suggested time
          </p>
          <p className="m-0 text-[24px] font-bold text-teal">
            {overview.timeLimitMinutes ? `${overview.timeLimitMinutes} min` : "—"}
          </p>
        </div>
        <div className="rounded-[10px] border border-app-border border-t-[3px] border-t-mastered bg-white p-4">
          <p className="m-0 mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-secondary">Total marks</p>
          <p className="m-0 text-[24px] font-bold text-mastered">{overview.totalMarks}</p>
        </div>
      </div>

      <div className="mb-4.5 max-w-[640px] rounded-[10px] border border-app-border bg-white p-4.5">
        {overview.status === "not_started" && (
          <p className="m-0 text-[13px] font-semibold text-ink-muted">You haven&apos;t started this paper yet.</p>
        )}
        {overview.status === "in_progress" && (
          <>
            <div className="mb-1.5 h-1.5 w-full overflow-hidden rounded-full bg-app-surface-muted">
              <div
                className="h-full rounded-full bg-progress"
                style={{
                  width: `${
                    overview.questionCount > 0
                      ? Math.round(((overview.answeredCount ?? 0) / overview.questionCount) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
            <p className="m-0 text-[13px] font-semibold text-progress">
              In progress · {overview.answeredCount ?? 0}/{overview.questionCount} answered
            </p>
          </>
        )}
        {overview.status === "completed" && (
          <p className="m-0 text-[13px] font-semibold text-mastered">✓ You&apos;ve completed this paper.</p>
        )}
      </div>

      <div className="mb-4.5 max-w-[640px] rounded-[10px] border border-app-border bg-white p-4.5">
        <p className="m-0 mb-2 text-[13px] font-bold text-ink">Before you start</p>
        <ul className="m-0 list-disc space-y-1 pl-4.5 text-[13px] text-ink-secondary">
          <li>Answer questions in any order — you can navigate freely between them.</li>
          <li>Your answers save automatically as you go.</li>
          <li>You can leave and resume anytime before you submit.</li>
        </ul>
      </div>

      <Link
        href={`/quiz/papers/${overview.id}`}
        className="inline-block rounded-md bg-navy-900 px-5 py-2.5 text-[13.5px] font-semibold text-white hover:bg-navy-800"
      >
        {BUTTON_LABEL[overview.status]}
      </Link>
    </AppShell>
  );
}
