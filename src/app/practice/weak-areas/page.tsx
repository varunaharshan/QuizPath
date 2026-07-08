import { redirect } from "next/navigation";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { getCompletedQuizzes, getWeakTopicsForGrade, type WeakTopic } from "@/lib/dashboard";
import { AppShell } from "@/components/app-shell";
import { TopicProgressTable, type TopicProgressData } from "@/components/topic-progress-table";

// <TopicProgressTable> is "use client" and deliberately defines its own
// local types rather than importing from @/lib/dashboard (which
// transitively imports the server-only-guarded @/db) — this remaps the
// Server Component's already-fetched data into that plain shape, same
// pattern as the By Topic page.
function toTopicProgressData(topic: WeakTopic): TopicProgressData {
  return {
    id: topic.id,
    name: topic.name,
    questionsAnswered: topic.questionsAnswered,
    correctCount: topic.correctCount,
    score: topic.score,
    label: topic.label,
    weakBadge: { weakCount: topic.weakSubTopicCount, totalCount: topic.totalSubTopicCount },
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
// (<TopicProgressTable>, reused as-is here, just with the weakBadge field
// populated) — rather than the earlier subject-tile grid. One row per
// topic (module) the student has actually attempted and that's itself
// needs_work (score < 60%, the same threshold used everywhere else in this
// app), sorted weakest-first; expanding a row reveals its own sub-topics.
// See src/lib/dashboard.ts's getWeakTopicsForGrade for the rollup itself.
export default async function WeakAreasPage() {
  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  const [weakTopics, completedQuizzes] = await Promise.all([
    getWeakTopicsForGrade(appUser.id, profile.grade),
    getCompletedQuizzes(appUser.id),
  ]);

  return (
    <AppShell
      active="weak-areas"
      studentName={appUser.name ?? appUser.email.split("@")[0]}
      grade={profile.grade}
      isActiveLearner={completedQuizzes.length > 0}
    >
      <h1 className="m-0 mb-1 text-lg font-bold text-navy-900">Weak Areas</h1>
      <p className="m-0 mb-4.5 text-[13px] text-ink-secondary">
        Topics where your accuracy is lowest — practice these first.
      </p>

      {weakTopics.length === 0 ? (
        <div className="rounded-[10px] border border-app-border bg-white p-4 text-sm text-ink-secondary">
          No weak areas right now — nice work! Keep practicing to stay sharp.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
          <div className="overflow-x-auto">
            <TopicProgressTable topics={weakTopics.map(toTopicProgressData)} />
          </div>
        </div>
      )}
    </AppShell>
  );
}
