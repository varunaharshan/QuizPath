"use client";

import { Fragment, useState } from "react";
import type { AdminTopic } from "@/lib/admin-topics";

// Admin-only "Content Coverage by Topic" table — one row per Topic (module)
// for the selected grade+subject, expandable to reveal its sub-topics. This
// is a deliberately separate component from the student-facing
// <TopicProgressTable> (src/components/topic-progress-table.tsx): the
// interaction pattern (expand-to-drill-down) is similar, but this one shows
// raw question counts for content-management purposes, not mastery
// percentages for a specific student, so the two aren't coupled even though
// they look alike.
export function AdminContentCoverageTable({ topics }: { topics: AdminTopic[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const maxCount = Math.max(1, ...topics.map((t) => t.questionCount));

  function toggle(topicId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) {
        next.delete(topicId);
      } else {
        next.add(topicId);
      }
      return next;
    });
  }

  return (
    <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-app-surface-muted text-left text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
            <th className="w-8 px-3.5 py-2.5" />
            <th className="px-3.5 py-2.5">Topic</th>
            <th className="px-3.5 py-2.5">Coverage</th>
            <th className="px-3.5 py-2.5">Questions</th>
          </tr>
        </thead>
        <tbody>
          {topics.map((topic) => {
            const isExpanded = expanded.has(topic.id);
            const widthPct = Math.round((topic.questionCount / maxCount) * 100);
            return (
              <Fragment key={topic.id}>
                <tr
                  onClick={() => toggle(topic.id)}
                  className="cursor-pointer border-b border-app-border align-top hover:bg-app-surface-muted"
                >
                  <td className="px-3.5 py-2.5 text-ink-muted">{isExpanded ? "▾" : "▸"}</td>
                  <td className="px-3.5 py-2.5 font-medium text-navy-900">{topic.name}</td>
                  <td className="px-3.5 py-2.5">
                    <div className="h-2 w-full max-w-[200px] rounded-full bg-app-surface-muted">
                      <div
                        className="h-2 rounded-full bg-progress"
                        style={{ width: `${topic.questionCount === 0 ? 0 : Math.max(widthPct, 4)}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5 text-ink-secondary">{topic.questionCount}</td>
                </tr>
                {isExpanded &&
                  topic.subTopics.map((subTopic) => (
                    <tr key={subTopic.id} className="border-b border-app-border bg-app-bg align-top">
                      <td className="px-3.5 py-2" />
                      <td className="py-2 pr-3.5 pl-7 text-ink-secondary">{subTopic.name}</td>
                      <td className="px-3.5 py-2">
                        {subTopic.questionCount === 0 && (
                          <span className="rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-bold text-warn">
                            No questions
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-2 text-ink-secondary">{subTopic.questionCount}</td>
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
