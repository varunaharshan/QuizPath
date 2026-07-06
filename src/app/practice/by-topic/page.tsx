import { redirect } from "next/navigation";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import {
  getCompletedQuizzes,
  getMostRecentlyPracticedSubjectId,
  getSubTopicStatusesForGrade,
  iconForModule,
} from "@/lib/dashboard";
import { groupTopicsBySubject } from "@/lib/practice";
import { AppShell } from "@/components/app-shell";
import { TopicCardGrid, type SubjectTopicTab } from "@/components/topic-card-grid";

export default async function ByTopicPage() {
  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  const [statuses, completedQuizzes, mostRecentSubjectId] = await Promise.all([
    getSubTopicStatusesForGrade(appUser.id, profile.grade),
    getCompletedQuizzes(appUser.id),
    getMostRecentlyPracticedSubjectId(appUser.id, profile.grade),
  ]);

  // Icons are precomputed here (Server Component) rather than inside
  // <TopicCardGrid> — that component is "use client", and iconForModule
  // lives in @/lib/dashboard, which transitively imports the server-only-
  // guarded @/db; importing it from client code would fail at build time.
  const groups: SubjectTopicTab[] = groupTopicsBySubject(statuses).map((group) => ({
    subjectId: group.subjectId,
    subjectName: group.subjectName,
    topics: group.topics.map((topic) => ({
      id: topic.id,
      name: topic.name,
      moduleName: topic.moduleName,
      icon: iconForModule(topic.moduleName),
      score: topic.score,
      questionsAnswered: topic.questionsAnswered,
    })),
  }));

  // Defaults to the subject the student most recently completed a quiz in;
  // falls back to the first subject (alphabetical, from groupTopicsBySubject)
  // when there's no completed-attempt history yet.
  const defaultSubjectId =
    groups.find((g) => g.subjectId === mostRecentSubjectId)?.subjectId ?? groups[0]?.subjectId ?? null;

  return (
    <AppShell
      active="practice-by-topic"
      studentName={appUser.name ?? appUser.email.split("@")[0]}
      grade={profile.grade}
      isActiveLearner={completedQuizzes.length > 0}
    >
      <h1 className="m-0 mb-1 text-lg font-bold text-navy-900">Practice by Topic</h1>
      <p className="m-0 mb-4.5 text-[13px] text-ink-secondary">
        Pick a subject and topic to drill specific content
      </p>

      {defaultSubjectId ? (
        <TopicCardGrid groups={groups} defaultSubjectId={defaultSubjectId} />
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
          <p className="p-4 text-sm text-ink-secondary">No topics are available yet for this grade.</p>
        </div>
      )}
    </AppShell>
  );
}
