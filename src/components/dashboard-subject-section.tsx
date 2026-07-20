"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { DashboardTopicTable, type DashboardTopicRow } from "@/components/dashboard-topic-table";
import { IncludeGrade10Toggle } from "@/components/include-grade10-toggle";
import { SubjectAccuracyChart } from "@/components/subject-accuracy-chart";
import { formatShortDate } from "@/lib/format";
import type { PaperAccuracyTrend } from "@/lib/dashboard";

// Type-only import above — @/lib/dashboard transitively pulls in the
// server-only-guarded @/db, but `import type` is erased entirely at
// compile time, so it carries no runtime dependency into this Client
// Component (the same rule already established for keyword-tag-input-logic.ts
// and topic-card.tsx).

export type GceGrade = "A" | "B" | "C" | "S" | "W";

export type CompletedQuizRow = {
  attemptId: string;
  title: string;
  type: "paper" | "topic_practice";
  completedAt: Date;
  correctCount: number;
  total: number;
  durationMinutes: number;
};

export type SubjectOverallStats = {
  quizzesCompleted: number;
  totalQuestionsAnswered: number;
  totalCorrectAnswers: number;
  averageScore: number | null;
};

// Everything one subject's worth of Dashboard widgets needs, pre-fetched by
// the Server Component for every subject at once — the same "fetch once,
// tab-switch client-side" shape <TopicCardGrid>/<PapersGrid> established,
// just lifted from a single widget's own local tab state up to the whole
// page. Switching the active subject below is a client-side read of
// whichever bundle is already in memory, never a new request.
export type SubjectBundle = {
  subjectId: string;
  subjectName: string;
  icon: string;
  // Direct G.C.E. O/L band mapping of this subject's own Score % — null
  // when the subject has zero questions answered ("Not started" state),
  // never a 6th "ungraded" band.
  grade: GceGrade | null;
  overallStats: SubjectOverallStats;
  topics: DashboardTopicRow[];
  // The same top-3 preview as `topics`, but with the "Include Grade 10
  // foundational topics" toggle applied — pre-fetched alongside `topics`
  // (not on demand) so flipping the toggle client-side never needs a new
  // request, matching the "fetch once, tab-switch client-side" pattern this
  // whole subject switcher already uses for `activeSubjectId`.
  topicsWithGrade10: DashboardTopicRow[];
  trend: PaperAccuracyTrend | null;
  recentPapers: CompletedQuizRow[];
  recentPractices: CompletedQuizRow[];
};

const GRADE_BADGE_STYLE: Record<GceGrade, string> = {
  A: "bg-dash-green-bg text-dash-green",
  B: "bg-dash-blue-bg text-dash-blue",
  C: "bg-dash-purple-bg text-dash-purple",
  S: "bg-dash-amber-bg text-dash-amber",
  W: "bg-dash-red-bg text-dash-red",
};

function StatCard({ icon, iconBg, label, value }: { icon: string; iconBg: string; label: string; value: string | number }) {
  return (
    <div className="flex items-start gap-3.5 rounded-[14px] border border-app-border bg-white p-4.5">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg ${iconBg}`}>{icon}</div>
      <div>
        <p className="m-0 mb-0.5 text-[13px] text-ink-secondary">{label}</p>
        <p className="m-0 text-2xl font-bold text-ink">{value}</p>
      </div>
    </div>
  );
}

// One shared table shape for both "Recent Full Tests" and "Recent
// Practices" — moved here from page.tsx now that both live inside this
// Client Component (each already scoped to one type via the Server
// Component's own getCompletedQuizzes calls, so this doesn't need to know
// which; it just renders whatever list/empty-message it's handed).
function RecentAttemptsTable({ quizzes, emptyMessage }: { quizzes: CompletedQuizRow[]; emptyMessage: string }) {
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
              {formatShortDate(quiz.completedAt)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// The Dashboard's single global subject filter — replaces every widget's
// own local subject-tab control (Topic Performance's old subject pills)
// with one shared switcher at the top of the page. `weakAreasSlot` is
// pre-rendered JSX from the Server Component parent (Weak Areas stays
// cross-subject/unscoped, per its own design, so it doesn't need to be
// part of this subject-indexed bundle at all) — passing already-rendered
// Server Component output into a Client Component's slot is the sanctioned
// way to mix the two without the Client Component importing server-only
// code itself.
export function DashboardSubjectSection({
  subjects,
  initialActiveSubjectId,
  grade,
  weakAreasSlot,
}: {
  subjects: SubjectBundle[];
  initialActiveSubjectId: string;
  grade: string;
  weakAreasSlot: ReactNode;
}) {
  const [activeSubjectId, setActiveSubjectId] = useState(initialActiveSubjectId);
  const [includeGrade10, setIncludeGrade10] = useState(false);
  const active = subjects.find((s) => s.subjectId === activeSubjectId) ?? subjects[0];

  return (
    <div>
      <div className="mb-4 rounded-[14px] border border-app-border bg-white p-4.5">
        <h3 className="m-0 mb-3.5 text-[15.5px] font-bold text-ink">Your subjects</h3>
        <div className="flex flex-wrap gap-3">
          {subjects.map((subject) => (
            <button
              key={subject.subjectId}
              type="button"
              onClick={() => setActiveSubjectId(subject.subjectId)}
              className={`flex w-32 flex-col items-center gap-2 rounded-xl border-2 bg-white p-3 text-center transition-colors ${
                subject.subjectId === active.subjectId
                  ? "border-dash-blue"
                  : "border-app-border hover:bg-app-surface-muted"
              }`}
            >
              <span className="text-xl">{subject.icon}</span>
              <span className="text-[13px] font-semibold text-ink">{subject.subjectName}</span>
              {subject.grade === null ? (
                <span className="text-[11.5px] text-ink-secondary">Not started</span>
              ) : (
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold ${GRADE_BADGE_STYLE[subject.grade]}`}
                >
                  {subject.grade}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon="📄" iconBg="bg-dash-blue-bg" label="Tests Completed" value={active.overallStats.quizzesCompleted} />
        <StatCard
          icon="✎"
          iconBg="bg-dash-purple-bg"
          label="Questions Answered"
          value={active.overallStats.totalQuestionsAnswered}
        />
        <StatCard
          icon="✓"
          iconBg="bg-dash-amber-bg"
          label="Correct Answers"
          value={active.overallStats.totalCorrectAnswers}
        />
        <StatCard
          icon="📊"
          iconBg="bg-dash-green-bg"
          label="Score %"
          value={active.overallStats.averageScore === null ? "—" : `${Math.round(active.overallStats.averageScore)}%`}
        />
      </div>

      <div className="mb-4 rounded-[14px] border border-app-border bg-white p-4.5">
        <h3 className="m-0 mb-3.5 text-[15.5px] font-bold text-ink">Your Subject Performance</h3>
        <SubjectAccuracyChart trends={active.trend ? [active.trend] : []} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-4">
          <div className="rounded-[14px] border border-app-border bg-white p-4.5">
            <h3 className="m-0 mb-3.5 text-[15.5px] font-bold text-ink">Topic Performance</h3>
            <IncludeGrade10Toggle checked={includeGrade10} onToggle={setIncludeGrade10} />
            <DashboardTopicTable
              topics={includeGrade10 ? active.topicsWithGrade10 : active.topics}
              primaryGrade={grade}
            />
            <div className="mt-3 text-center">
              <Link
                href={`/practice/by-topic?grade=${grade}&subjectId=${active.subjectId}`}
                className="text-[12.5px] font-semibold text-dash-blue hover:underline"
              >
                View all topics →
              </Link>
            </div>
          </div>

          {weakAreasSlot}
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-[14px] border border-app-border bg-white p-4.5">
            <div className="mb-3.5 flex items-center justify-between">
              <h3 className="m-0 text-[15.5px] font-bold text-ink">Recent Full Tests</h3>
              <Link
                href={`/papers?grade=${grade}&subjectId=${active.subjectId}`}
                className="text-[12.5px] font-semibold text-dash-blue hover:underline"
              >
                View all
              </Link>
            </div>
            <RecentAttemptsTable quizzes={active.recentPapers} emptyMessage="You haven't completed any full tests yet." />
          </div>

          <div className="rounded-[14px] border border-app-border bg-white p-4.5">
            <div className="mb-3.5 flex items-center justify-between">
              <h3 className="m-0 text-[15.5px] font-bold text-ink">Recent Practices</h3>
              <Link
                href={`/practice/by-topic?grade=${grade}&subjectId=${active.subjectId}`}
                className="text-[12.5px] font-semibold text-dash-blue hover:underline"
              >
                View all
              </Link>
            </div>
            <RecentAttemptsTable
              quizzes={active.recentPractices}
              emptyMessage="You haven't completed any practice sessions yet."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
