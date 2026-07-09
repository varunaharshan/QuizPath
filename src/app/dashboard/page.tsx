import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import {
  type CompletedQuiz,
  getCompletedQuizzes,
  getMostRecentlyPracticedSubjectId,
  getOverallStats,
  getPaperAccuracyTrend,
  getProgressStats,
  getSubTopicStatusesForGrade,
  getTopicStatusesForGrade,
  iconForModule,
  iconForSubject,
} from "@/lib/dashboard";
import { groupTopicStatusesBySubject, groupTopicsBySubject, groupWeakAreasBySubject, weakAreas } from "@/lib/practice";
import { getPracticeSubjects } from "@/lib/papers";
import { AppShell } from "@/components/app-shell";
import { DashboardTopicTable, type SubjectTopicTab } from "@/components/dashboard-topic-table";
import { SubjectAccuracyChart } from "@/components/subject-accuracy-chart";

// Recent Full Tests / Recent Practices each show their own latest 3 rows —
// a fixed, independent cap per widget, not a shared pool split after the
// fact (see the two separate getCompletedQuizzes calls below).
const RECENT_ACTIVITY_LIMIT = 3;

// One shared table shape for both "Recent Full Tests" and "Recent
// Practices" — each widget's own getCompletedQuizzes call already filters
// to one `type`, so this component doesn't need to know which; it just
// renders whatever list (and empty-state copy) it's handed.
function RecentAttemptsTable({ quizzes, emptyMessage }: { quizzes: CompletedQuiz[]; emptyMessage: string }) {
  if (quizzes.length === 0) {
    return <p className="m-0 text-sm text-ink-secondary">{emptyMessage}</p>;
  }

  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr>
          <th className="border-b border-app-border pb-2.5 pr-2 text-left text-[11.5px] font-semibold uppercase tracking-wide text-ink-secondary">
            Paper
          </th>
          <th className="border-b border-app-border pb-2.5 pr-2 text-left text-[11.5px] font-semibold uppercase tracking-wide text-ink-secondary">
            Score
          </th>
          <th className="border-b border-app-border pb-2.5 pr-2 text-left text-[11.5px] font-semibold uppercase tracking-wide text-ink-secondary">
            Time
          </th>
          <th className="border-b border-app-border pb-2.5 text-left text-[11.5px] font-semibold uppercase tracking-wide text-ink-secondary">
            Date
          </th>
        </tr>
      </thead>
      <tbody>
        {quizzes.map((quiz) => (
          <tr key={quiz.attemptId}>
            <td className="max-w-[140px] truncate border-b border-app-border py-2.5 pr-2">
              {quiz.type === "topic_practice" ? `Practice: ${quiz.title}` : quiz.title}
            </td>
            <td className="border-b border-app-border py-2.5 pr-2">
              {quiz.total === 0 ? "—" : `${Math.round((quiz.correctCount / quiz.total) * 100)}%`}
            </td>
            <td className="border-b border-app-border py-2.5 pr-2">{quiz.durationMinutes}m</td>
            <td className="border-b border-app-border py-2.5 text-ink-secondary">
              {quiz.completedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Restyled to match a GradeBoost-style reference mockup (docs/ upload) —
// content area only, see CLAUDE.md "Dashboard" for the full rationale.
// Deliberately drops the previous "Continue where you left off" and
// "Recommended practice" cards: neither is part of the new layout, and
// Weak Areas below now covers similar ground to Recommended practice.
export default async function DashboardPage() {
  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  const [subjects, statuses, topicStatuses, recentPapers, recentPractices, overallStats, trends, mostRecentSubjectId] =
    await Promise.all([
      getPracticeSubjects(),
      getSubTopicStatusesForGrade(appUser.id, profile.grade),
      getTopicStatusesForGrade(appUser.id, profile.grade),
      getCompletedQuizzes(appUser.id, { grade: profile.grade, limit: RECENT_ACTIVITY_LIMIT, type: "paper" }),
      getCompletedQuizzes(appUser.id, {
        grade: profile.grade,
        limit: RECENT_ACTIVITY_LIMIT,
        type: "topic_practice",
      }),
      getOverallStats(appUser.id, profile.grade),
      getPaperAccuracyTrend(appUser.id, profile.grade),
      getMostRecentlyPracticedSubjectId(appUser.id, profile.grade),
    ]);

  const topicGroups = groupTopicsBySubject(statuses);
  const weakGroups = groupWeakAreasBySubject(weakAreas(statuses));

  // Per-subject average score for the subject breakdown list — reuses
  // getProgressStats exactly as the Progress tab does, just called once per
  // subject that actually has topics for this grade (topicGroups), rather
  // than modifying getProgressStats itself.
  const subjectSummaries = await Promise.all(
    topicGroups.map(async (group) => {
      const stats = await getProgressStats(appUser.id, profile.grade, group.subjectId);
      const attempted = group.topics.filter((t) => t.score !== null);
      const strongest = attempted.length
        ? attempted.reduce((best, t) => (t.score! > best.score! ? t : best))
        : null;
      return {
        subjectId: group.subjectId,
        subjectName: group.subjectName,
        averageScore: stats.averageScore,
        strongestLabel: strongest ? `Strongest: ${strongest.name}` : "Not started yet",
      };
    }),
  );

  // Topic Performance is a "top performers" preview (not the full syllabus
  // list By Topic already owns) — the 3 highest-scoring attempted Topics
  // (modules) per subject, descending, rolled up across each Topic's own
  // sub-topics rather than listing sub-topics directly (see
  // getTopicStatusesForGrade). Not-started topics have no score to rank by,
  // so they're excluded here rather than padding the preview out to 3.
  const topicStatusGroups = groupTopicStatusesBySubject(topicStatuses);
  const topicTabs: SubjectTopicTab[] = topicStatusGroups.map((group) => ({
    subjectId: group.subjectId,
    subjectName: group.subjectName,
    topics: group.topics
      .filter((t) => t.score !== null)
      .sort((a, b) => b.score! - a.score!)
      .slice(0, 3)
      .map((topic) => ({
        id: topic.id,
        name: topic.name,
        icon: iconForModule(topic.name),
        score: topic.score,
        questionsAnswered: topic.questionsAnswered,
      })),
  }));
  const defaultTopicSubjectId =
    topicTabs.find((t) => t.subjectId === mostRecentSubjectId)?.subjectId ?? topicTabs[0]?.subjectId ?? null;

  const subject = subjects[0] as { id: string; name: string } | undefined;
  const byTopicHref = subject
    ? `/practice/by-topic?grade=${profile.grade}&subjectId=${subject.id}`
    : "/practice/by-topic";
  const displayName = appUser.name ?? appUser.email.split("@")[0];
  const firstName = displayName.split(" ")[0];

  return (
    <AppShell
      active="dashboard"
      studentName={displayName}
      grade={profile.grade}
      isActiveLearner={recentPapers.length > 0 || recentPractices.length > 0}
    >
      <h1 className="m-0 mb-1 text-lg font-bold text-navy-900">Welcome back, {firstName}</h1>
      <p className="m-0 mb-4.5 text-[13px] text-ink-secondary">
        Grade {profile.grade} · {subject?.name ?? "Science"}
      </p>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="flex items-start gap-3.5 rounded-[14px] border border-app-border bg-white p-4.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-dash-blue-bg text-lg">
            📄
          </div>
          <div>
            <p className="m-0 mb-0.5 text-[13px] text-ink-secondary">Tests Completed</p>
            <p className="m-0 text-2xl font-bold text-ink">{overallStats.quizzesCompleted}</p>
          </div>
        </div>
        <div className="flex items-start gap-3.5 rounded-[14px] border border-app-border bg-white p-4.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-dash-green-bg text-lg">
            📊
          </div>
          <div>
            <p className="m-0 mb-0.5 text-[13px] text-ink-secondary">Average Score</p>
            <p className="m-0 text-2xl font-bold text-ink">
              {overallStats.averageScore === null ? "—" : `${Math.round(overallStats.averageScore)}%`}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3.5 rounded-[14px] border border-app-border bg-white p-4.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-dash-purple-bg text-lg">
            ✎
          </div>
          <div>
            <p className="m-0 mb-0.5 text-[13px] text-ink-secondary">Questions Answered</p>
            <p className="m-0 text-2xl font-bold text-ink">{overallStats.totalQuestionsAnswered}</p>
          </div>
        </div>
        <div className="flex items-start gap-3.5 rounded-[14px] border border-app-border bg-white p-4.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-dash-amber-bg text-lg">
            ✓
          </div>
          <div>
            <p className="m-0 mb-0.5 text-[13px] text-ink-secondary">Correct Answers</p>
            <p className="m-0 text-2xl font-bold text-ink">{overallStats.totalCorrectAnswers}</p>
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-[14px] border border-app-border bg-white p-4.5">
          <h3 className="m-0 mb-3.5 text-[15.5px] font-bold text-ink">Your Subject Performance</h3>
          <SubjectAccuracyChart trends={trends} />
        </div>
        <div className="rounded-[14px] border border-app-border bg-white p-4.5">
          {subjectSummaries.length === 0 ? (
            <p className="m-0 text-sm text-ink-secondary">No subjects with content yet for this grade.</p>
          ) : (
            subjectSummaries.map((s) => (
              <div key={s.subjectId} className="mb-2.5 flex items-center gap-3 rounded-xl border border-app-border p-3 last:mb-0">
                <div className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-lg bg-dash-blue-bg text-[15px]">
                  {iconForSubject(s.subjectName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[13.5px] font-semibold text-ink">{s.subjectName}</p>
                  <p className="m-0 text-[11.5px] text-ink-secondary">{s.strongestLabel}</p>
                </div>
                <div className="text-[15px] font-bold text-ink">
                  {s.averageScore === null ? "—" : `${Math.round(s.averageScore)}%`}
                </div>
              </div>
            ))
          )}
          <Link
            href={byTopicHref}
            className="mt-3 block w-full rounded-md border border-dash-blue-bg bg-white py-2 text-center text-[12.5px] font-semibold text-dash-blue hover:bg-dash-blue-bg"
          >
            View full analytics
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-4">
          <div className="rounded-[14px] border border-app-border bg-white p-4.5">
            <h3 className="m-0 mb-3.5 text-[15.5px] font-bold text-ink">Topic Performance</h3>
            {defaultTopicSubjectId ? (
              <DashboardTopicTable groups={topicTabs} defaultSubjectId={defaultTopicSubjectId} />
            ) : (
              <p className="m-0 text-sm text-ink-secondary">No topics are available yet for this grade.</p>
            )}
            <div className="mt-3 text-center">
              <Link href="/practice/by-topic" className="text-[12.5px] font-semibold text-dash-blue hover:underline">
                View all topics →
              </Link>
            </div>
          </div>

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
                <div key={group.subjectId} className="flex items-center gap-3 border-b border-app-border py-2.5 last:border-b-0">
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
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-[14px] border border-app-border bg-white p-4.5">
            <div className="mb-3.5 flex items-center justify-between">
              <h3 className="m-0 text-[15.5px] font-bold text-ink">Recent Full Tests</h3>
              <Link href="/papers" className="text-[12.5px] font-semibold text-dash-blue hover:underline">
                View all
              </Link>
            </div>
            <RecentAttemptsTable quizzes={recentPapers} emptyMessage="You haven't completed any full tests yet." />
          </div>

          <div className="rounded-[14px] border border-app-border bg-white p-4.5">
            <div className="mb-3.5 flex items-center justify-between">
              <h3 className="m-0 text-[15.5px] font-bold text-ink">Recent Practices</h3>
              <Link href="/practice/by-topic" className="text-[12.5px] font-semibold text-dash-blue hover:underline">
                View all
              </Link>
            </div>
            <RecentAttemptsTable
              quizzes={recentPractices}
              emptyMessage="You haven't completed any practice sessions yet."
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
