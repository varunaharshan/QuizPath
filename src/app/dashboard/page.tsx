import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import {
  gceGradeForScore,
  getCompletedQuizzes,
  getMostRecentlyPracticedSubjectId,
  getOverallStats,
  getPaperAccuracyTrend,
  getSubTopicStatusesForGrade,
  getTopicStatusesForGrade,
  iconForModule,
  iconForSubject,
} from "@/lib/dashboard";
import { groupTopicStatusesBySubject, groupWeakAreasBySubject, weakAreas } from "@/lib/practice";
import { getSubjectsForGrade } from "@/lib/papers";
import { AppShell } from "@/components/app-shell";
import { DashboardSubjectSection, type SubjectBundle } from "@/components/dashboard-subject-section";

// Recent Full Tests / Recent Practices each show their own latest 3 rows —
// a fixed, independent cap per widget/subject, not a shared pool split
// after the fact.
const RECENT_ACTIVITY_LIMIT = 3;

// Topic Performance is a "top performers" preview (not the full syllabus
// list By Topic already owns) — the 3 highest-scoring attempted topics.
const TOPIC_PREVIEW_LIMIT = 3;

// Restyled to match a GradeBoost-style reference mockup — content area
// only, see CLAUDE.md "Dashboard" for the full rationale. A single global
// "Your subjects" switcher (<DashboardSubjectSection>) replaced every
// widget's own local subject-tab control: the Server Component here
// pre-fetches every widget's data for every one of the student's subjects
// at once and hands the whole bundle down, so switching the active subject
// is a client-side read of already-fetched data, never a new request —
// the same "fetch once, tab-switch client-side" shape already established
// elsewhere in this app, just lifted to the whole page.
export default async function DashboardPage() {
  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  const [subjectList, statuses, topicStatuses, trends, mostRecentSubjectId] = await Promise.all([
    getSubjectsForGrade(profile.grade),
    getSubTopicStatusesForGrade(appUser.id, profile.grade),
    getTopicStatusesForGrade(appUser.id, profile.grade),
    getPaperAccuracyTrend(appUser.id, profile.grade),
    getMostRecentlyPracticedSubjectId(appUser.id, profile.grade),
  ]);

  // Your Weak Areas stays exactly as before — cross-subject, unscoped by
  // the new subject switcher (it already surfaces which subjects/topics
  // are weak in one glance, which the switcher's own grade badges don't
  // replace).
  const weakGroups = groupWeakAreasBySubject(weakAreas(statuses));

  const topicsBySubjectId = new Map(
    groupTopicStatusesBySubject(topicStatuses).map((group) => [group.subjectId, group.topics]),
  );
  const trendBySubjectId = new Map(trends.map((trend) => [trend.subjectId, trend]));

  const subjects: SubjectBundle[] = await Promise.all(
    subjectList.map(async (subject) => {
      const [overallStats, recentPapers, recentPractices] = await Promise.all([
        getOverallStats(appUser.id, profile.grade, subject.id),
        getCompletedQuizzes(appUser.id, {
          grade: profile.grade,
          limit: RECENT_ACTIVITY_LIMIT,
          type: "paper",
          subjectId: subject.id,
        }),
        getCompletedQuizzes(appUser.id, {
          grade: profile.grade,
          limit: RECENT_ACTIVITY_LIMIT,
          type: "topic_practice",
          subjectId: subject.id,
        }),
      ]);

      const topics = (topicsBySubjectId.get(subject.id) ?? [])
        .filter((topic) => topic.score !== null)
        .sort((a, b) => b.score! - a.score!)
        .slice(0, TOPIC_PREVIEW_LIMIT)
        .map((topic) => ({
          id: topic.id,
          name: topic.name,
          icon: iconForModule(topic.name),
          score: topic.score,
          questionsAnswered: topic.questionsAnswered,
        }));

      return {
        subjectId: subject.id,
        subjectName: subject.name,
        icon: iconForSubject(subject.name),
        grade: overallStats.totalQuestionsAnswered === 0 ? null : gceGradeForScore(overallStats.averageScore!),
        overallStats,
        topics,
        trend: trendBySubjectId.get(subject.id) ?? null,
        recentPapers,
        recentPractices,
      };
    }),
  );

  const initialActiveSubjectId =
    subjects.find((s) => s.subjectId === mostRecentSubjectId)?.subjectId ?? subjects[0]?.subjectId ?? "";
  const isActiveLearner = subjects.some((s) => s.recentPapers.length > 0 || s.recentPractices.length > 0);

  const displayName = appUser.name ?? appUser.email.split("@")[0];
  const firstName = displayName.split(" ")[0];

  return (
    <AppShell active="dashboard" studentName={displayName} grade={profile.grade} isActiveLearner={isActiveLearner}>
      <h1 className="m-0 mb-1 text-lg font-bold text-navy-900">Welcome back, {firstName}</h1>
      <p className="m-0 mb-4.5 text-[13px] text-ink-secondary">Grade {profile.grade}</p>

      {subjects.length === 0 ? (
        <div className="rounded-[14px] border border-app-border bg-white p-4.5 text-sm text-ink-secondary">
          No subjects are available yet for Grade {profile.grade}.
        </div>
      ) : (
        <DashboardSubjectSection
          subjects={subjects}
          initialActiveSubjectId={initialActiveSubjectId}
          grade={profile.grade}
          weakAreasSlot={
            <div className="rounded-[14px] border border-app-border bg-white p-4.5">
              <div className="mb-3.5 flex items-center justify-between">
                <h3 className="m-0 text-[15.5px] font-bold text-ink">Your Weak Areas</h3>
                <Link href="/practice/weak-areas" className="text-[12.5px] font-semibold text-dash-blue hover:underline">
                  View all
                </Link>
              </div>
              {weakGroups.length === 0 ? (
                <p className="m-0 text-sm text-ink-secondary">No weak areas right now — nice work!</p>
              ) : (
                weakGroups.map((group) => (
                  <div
                    key={group.subjectId}
                    className="flex items-center gap-3 border-b border-app-border py-2.5 last:border-b-0"
                  >
                    <div className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-lg bg-dash-purple-bg text-[15px]">
                      {iconForSubject(group.subjectName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="m-0 text-[13.5px] font-semibold text-ink">{group.subjectName}</p>
                      <p className="m-0 text-[11.5px] text-ink-secondary">
                        {group.totalCount} weak topic{group.totalCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        group.accuracy < 40 ? "bg-dash-red-bg text-dash-red" : "bg-dash-amber-bg text-dash-amber"
                      }`}
                    >
                      {Math.round(group.accuracy)}%
                    </span>
                  </div>
                ))
              )}
              <div className="mt-3.5 flex gap-2.5 rounded-xl bg-dash-amber-bg p-3.5 text-[12.5px]">
                💡{" "}
                <span>
                  Focus on these topics to improve your scores!
                  <br />
                  <Link href="/practice/weak-areas" className="font-semibold text-dash-amber hover:underline">
                    Practice Weak Areas
                  </Link>
                </span>
              </div>
            </div>
          }
        />
      )}
    </AppShell>
  );
}
