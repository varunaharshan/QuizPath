"use client";

import { useState } from "react";

// One row per Topic (module), not a bare sub-topic — mirrors the
// topic-primary rule <TopicProgressTable> established for By Topic/Weak
// Areas (see CLAUDE.md "Dashboard"/"Practice"). No `moduleName` field here
// (unlike TopicCardData, which this used to reuse): at this grain the topic
// *is* the module, so a separate parent-module label would be redundant.
export type DashboardTopicRow = {
  id: string;
  name: string;
  icon: string;
  score: number | null;
  questionsAnswered: number;
};

export type SubjectTopicTab = {
  subjectId: string;
  subjectName: string;
  topics: DashboardTopicRow[];
};

// Subject-tab switcher + accuracy table for the Dashboard's "Topic
// Performance" card — a table row per topic instead of a card grid,
// matching the dash-* mockup's own table styling for this screen. Was
// previously "deliberately its own component rather than reusing
// <TopicCardGrid> directly" (that card-grid component backed the old
// "Practice by Topic" page, since replaced by the topic-rollup "By topic"
// page — see CLAUDE.md "App shell"); this component and its data shape are
// otherwise unaffected by that removal. No per-row Practice link: a Topic
// row has no single quiz to launch (this app has no pooled multi-sub-topic
// quiz mode), the same reason <TopicProgressTable> only ever puts a
// Practice button on its expanded sub-topic rows — "View all topics →"
// below this table is the entry point into that drill-down.
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
              <th className="border-b border-app-border pb-2.5 text-left text-[11.5px] font-semibold uppercase tracking-wide text-ink-secondary">
                Questions
              </th>
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
                <td className="border-b border-app-border py-2.5">{topic.questionsAnswered}</td>
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
