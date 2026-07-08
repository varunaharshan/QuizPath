"use client";

import { useState } from "react";
import Link from "next/link";
import type { TopicCardData } from "@/components/topic-card";

export type SubjectTopicTab = {
  subjectId: string;
  subjectName: string;
  topics: TopicCardData[];
};

// Subject-tab switcher + accuracy table for the Dashboard's "Topic
// Performance" card — a table row per topic instead of a card grid,
// matching the dash-* mockup's own table styling for this screen. Was
// previously "deliberately its own component rather than reusing
// <TopicCardGrid> directly" (that card-grid component backed the old
// "Practice by Topic" page, since replaced by the topic-rollup "By topic"
// page — see CLAUDE.md "App shell"); this component and its data shape are
// otherwise unaffected by that removal.
export function DashboardTopicTable({
  groups,
  defaultSubjectId,
}: {
  groups: SubjectTopicTab[];
  defaultSubjectId: string;
}) {
  const [activeSubjectId, setActiveSubjectId] = useState(defaultSubjectId);
  const active = groups.find((g) => g.subjectId === activeSubjectId) ?? groups[0];

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap gap-1.5">
        {groups.map((group) => (
          <button
            key={group.subjectId}
            type="button"
            onClick={() => setActiveSubjectId(group.subjectId)}
            className={`rounded-md px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
              group.subjectId === active?.subjectId
                ? "bg-dash-blue text-white"
                : "bg-app-surface-muted text-ink-secondary hover:bg-app-border"
            }`}
          >
            {group.subjectName}
          </button>
        ))}
      </div>

      {active && active.topics.length > 0 ? (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="border-b border-app-border pb-2.5 pr-2 text-left text-[11.5px] font-semibold uppercase tracking-wide text-ink-secondary">
                Topic
              </th>
              <th className="border-b border-app-border pb-2.5 pr-2 text-left text-[11.5px] font-semibold uppercase tracking-wide text-ink-secondary">
                Accuracy
              </th>
              <th className="border-b border-app-border pb-2.5 pr-2 text-left text-[11.5px] font-semibold uppercase tracking-wide text-ink-secondary">
                Questions
              </th>
              <th className="border-b border-app-border pb-2.5 text-left text-[11.5px] font-semibold uppercase tracking-wide text-ink-secondary" />
            </tr>
          </thead>
          <tbody>
            {active.topics.map((topic) => (
              <tr key={topic.id}>
                <td className="border-b border-app-border py-2.5 pr-2">
                  {topic.icon} {topic.name}
                </td>
                <td className="border-b border-app-border py-2.5 pr-2">
                  {topic.score === null ? (
                    "—"
                  ) : (
                    <>
                      <span className="mr-2 inline-block h-[7px] w-[70px] overflow-hidden rounded-full bg-app-surface-muted align-middle">
                        <span
                          className="block h-full rounded-full bg-dash-green"
                          style={{ width: `${Math.round(topic.score)}%` }}
                        />
                      </span>
                      {topic.score}%
                    </>
                  )}
                </td>
                <td className="border-b border-app-border py-2.5 pr-2">{topic.questionsAnswered}</td>
                <td className="border-b border-app-border py-2.5 text-right">
                  <Link
                    href={`/quiz/${topic.id}`}
                    className="rounded-md bg-dash-blue-bg px-3 py-1 text-[12px] font-semibold text-dash-blue hover:opacity-80"
                  >
                    Practice
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="m-0 text-sm text-ink-secondary">No topics are available yet for this subject.</p>
      )}
    </div>
  );
}
