import { redirect } from "next/navigation";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { getCompletedQuizzes, getSubTopicStatusesForGrade } from "@/lib/dashboard";
import { weakAreas } from "@/lib/practice";
import { AppShell } from "@/components/app-shell";
import { TopicPracticeList } from "@/components/topic-practice-list";

export default async function WeakAreasPage() {
  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  const [statuses, completedQuizzes] = await Promise.all([
    getSubTopicStatusesForGrade(appUser.id, profile.grade),
    getCompletedQuizzes(appUser.id),
  ]);

  const weak = weakAreas(statuses);

  return (
    <AppShell
      active="practice-weak-areas"
      studentName={appUser.name ?? appUser.email.split("@")[0]}
      grade={profile.grade}
      isActiveLearner={completedQuizzes.length > 0}
    >
      <h1 className="m-0 mb-1 text-lg font-bold text-navy-900">Weak Areas</h1>
      <p className="m-0 mb-4.5 text-[13px] text-ink-secondary">
        Sub-topics where your accuracy is lowest — practice these first.
      </p>

      <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
        <TopicPracticeList
          topics={weak}
          emptyMessage="No weak areas right now — nice work! Keep practicing to stay sharp."
        />
      </div>
    </AppShell>
  );
}
