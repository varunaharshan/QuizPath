import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { getCompletedQuizzes, getSubTopicStatusesForGrade, iconForSubject } from "@/lib/dashboard";
import { groupWeakAreasBySubject, weakAreas } from "@/lib/practice";
import { AppShell } from "@/components/app-shell";
import { TopicPracticeList } from "@/components/topic-practice-list";
import { WeakAreaSubjectTile } from "@/components/weak-area-subject-tile";

export default async function WeakAreasPage({
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
  const filterSubjectId = typeof params.subjectId === "string" ? params.subjectId : undefined;

  const [statuses, completedQuizzes] = await Promise.all([
    getSubTopicStatusesForGrade(appUser.id, profile.grade),
    getCompletedQuizzes(appUser.id),
  ]);

  const weak = weakAreas(statuses);

  // "View All" on a tile drills into every weak sub-topic for that one
  // subject (not just the top few shown on the tile) — same page, filtered
  // by query string, matching the Papers/Progress filter-form pattern
  // elsewhere in this app rather than a new route.
  const subjectWeak = filterSubjectId ? weak.filter((t) => t.subjectId === filterSubjectId) : null;

  return (
    <AppShell
      active="weak-areas"
      studentName={appUser.name ?? appUser.email.split("@")[0]}
      grade={profile.grade}
      isActiveLearner={completedQuizzes.length > 0}
    >
      <h1 className="m-0 mb-1 text-lg font-bold text-navy-900">Weak Areas</h1>
      <p className="m-0 mb-4.5 text-[13px] text-ink-secondary">
        Sub-topics where your accuracy is lowest — practice these first.
      </p>

      {subjectWeak ? (
        <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
          <div className="flex items-center justify-between border-b border-app-border px-4.5 py-3.5">
            <span className="text-[13.5px] font-bold text-navy-900">
              {iconForSubject(subjectWeak[0]?.subjectName ?? "")} {subjectWeak[0]?.subjectName ?? "Subject"}
            </span>
            <Link href="/practice/weak-areas" className="text-[12.5px] font-semibold text-progress hover:underline">
              ← All subjects
            </Link>
          </div>
          <TopicPracticeList topics={subjectWeak} emptyMessage="No weak areas right now — nice work! Keep practicing to stay sharp." />
        </div>
      ) : (
        (() => {
          const groups = groupWeakAreasBySubject(weak);
          return groups.length === 0 ? (
            <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
              <p className="p-4 text-sm text-ink-secondary">
                No weak areas right now — nice work! Keep practicing to stay sharp.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4.5 lg:grid-cols-2">
              {groups.map((group) => (
                <WeakAreaSubjectTile key={group.subjectId} group={group} />
              ))}
            </div>
          );
        })()
      )}
    </AppShell>
  );
}
