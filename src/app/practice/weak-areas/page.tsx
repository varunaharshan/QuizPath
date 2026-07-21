import { redirect } from "next/navigation";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { getCompletedQuizzes, getWeakTopicsForGrade, type TopicProgress } from "@/lib/dashboard";
import { AppShell } from "@/components/app-shell";
import { IncludeGrade10Toggle } from "@/components/include-grade10-toggle";
import { TopicProgressTable, type TopicProgressData } from "@/components/topic-progress-table";

// <TopicProgressTable> is "use client" and deliberately defines its own
// local types rather than importing from @/lib/dashboard (which
// transitively imports the server-only-guarded @/db) — this remaps the
// Server Component's already-fetched data into that plain shape, same
// pattern as the By Topic page.
function toTopicProgressData(topic: TopicProgress): TopicProgressData {
  return {
    id: topic.id,
    name: topic.name,
    questionsAnswered: topic.questionsAnswered,
    correctCount: topic.correctCount,
    score: topic.score,
    label: topic.label,
    grade: topic.grade,
    subTopics: topic.subTopics.map((subTopic) => ({
      id: subTopic.id,
      name: subTopic.name,
      questionsAnswered: subTopic.questionsAnswered,
      correctCount: subTopic.correctCount,
      score: subTopic.score,
      label: subTopic.label,
    })),
  };
}

// Topic-primary, expandable list — same pattern as By Topic
// (<TopicProgressTable>, reused as-is here) rather than the earlier
// subject-tile grid. A topic appears here if at least one of its
// sub-topics is individually needs_work (score < 60%); the topic row's own
// progress bar/score is still its true full aggregate across every
// sub-topic (not just the weak slice), while the expanded drill-down shows
// only the weak sub-topics — never-attempted or already-fine ones are
// omitted there. See src/lib/dashboard.ts's getWeakTopicsForGrade for the
// rollup/filtering itself.
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
  // The toggle only ever makes sense for a Grade 11 student — there's
  // nothing below Grade 10 to widen to, and profile.grade is always a real
  // "10"/"11" value (onboarding/profile only ever accept those two — never
  // "gcse", which is a browsing-only concept elsewhere in this app). Gating
  // here, not just leaving the underlying function's default parameter to
  // do the work, is what keeps the toggle from ever appearing for a Grade
  // 10 student.
  const canIncludeGrade10 = profile.grade === "11";
  const includeGrade10 = canIncludeGrade10 && params.includeGrade10 === "true";

  const [weakTopics, completedQuizzes] = await Promise.all([
    getWeakTopicsForGrade(appUser.id, profile.grade, includeGrade10),
    getCompletedQuizzes(appUser.id),
  ]);

  return (
    <AppShell
      active="weak-areas"
      studentName={appUser.name ?? appUser.email.split("@")[0]}
      grade={profile.grade}
      isActiveLearner={completedQuizzes.length > 0}
    >
      <h1 className="m-0 mb-1 text-xl font-bold text-navy-900">Weak Areas</h1>
      <p className="m-0 mb-4.5 text-[13px] text-ink-secondary">
        Topics with at least one sub-topic below 60% accuracy — practice these first.
      </p>

      {canIncludeGrade10 && (
        <IncludeGrade10Toggle
          checked={includeGrade10}
          href={includeGrade10 ? "/practice/weak-areas" : "/practice/weak-areas?includeGrade10=true"}
        />
      )}

      {weakTopics.length === 0 ? (
        <div className="rounded-[10px] border border-app-border bg-white p-4 text-sm text-ink-secondary">
          No sub-topics are below 60% right now — nice work! Keep practicing to stay sharp.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
          <div className="overflow-x-auto">
            <TopicProgressTable topics={weakTopics.map(toTopicProgressData)} primaryGrade={profile.grade} />
          </div>
        </div>
      )}
    </AppShell>
  );
}
