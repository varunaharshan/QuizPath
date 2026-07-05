import { redirect } from "next/navigation";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { getCompletedQuizzes, getSubTopicStatusesForGrade } from "@/lib/dashboard";
import { AppShell } from "@/components/app-shell";
import { TopicPracticeList } from "@/components/topic-practice-list";

// No subject tabs yet — Science is the only subject today (see CLAUDE.md
// "Single-tenant MVP"), so a tab bar with one permanently-selected tab would
// be pure decoration. Add tabs back once there's a real second subject to
// switch between.
export default async function ByTopicPage() {
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

  return (
    <AppShell
      active="practice-by-topic"
      studentName={appUser.name ?? appUser.email.split("@")[0]}
      grade={profile.grade}
      isActiveLearner={completedQuizzes.length > 0}
    >
      <h1 className="m-0 mb-1 text-lg font-bold text-navy-900">Practice by Topic</h1>
      <p className="m-0 mb-4.5 text-[13px] text-ink-secondary">
        Every sub-topic for Grade {profile.grade} Science, in syllabus order.
      </p>

      <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
        <TopicPracticeList topics={statuses} emptyMessage="No topics are available yet for this grade." />
      </div>
    </AppShell>
  );
}
