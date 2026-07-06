"use client";

import { useState } from "react";
import Link from "next/link";

// Deliberately not importing SubTopicStatus (or any runtime value) from
// @/lib/dashboard or @/lib/practice here — both transitively import @/db,
// which is guarded with `import "server-only"` (see CLAUDE.md "Database").
// A Client Component bundling that import would fail at build time, so the
// Server Component page precomputes everything (including each topic's
// icon, via iconForModule) and passes plain data down instead.
export type TopicCardData = {
  id: string;
  name: string;
  moduleName: string;
  icon: string;
  score: number | null;
  questionsAnswered: number;
};

export type SubjectTopicTab = {
  subjectId: string;
  subjectName: string;
  topics: TopicCardData[];
};

// Subject tab switcher + card grid for Practice by Topic. Tab switching is
// pure client state (no navigation/reload, per spec) — all subjects' data is
// fetched once server-side and handed down, so switching tabs is just
// picking which already-fetched group to render.
export function TopicCardGrid({
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
      <div className="mb-4.5 flex flex-wrap gap-2">
        {groups.map((group) => (
          <button
            key={group.subjectId}
            type="button"
            onClick={() => setActiveSubjectId(group.subjectId)}
            className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
              group.subjectId === active?.subjectId
                ? "bg-navy-900 text-white"
                : "bg-app-surface-muted text-ink-secondary hover:bg-app-border"
            }`}
          >
            {group.subjectName}
          </button>
        ))}
      </div>

      {active && active.topics.length > 0 ? (
        <div className="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
          {active.topics.map((topic) => (
            <div
              key={topic.id}
              className="flex flex-col rounded-[10px] border border-app-border bg-white p-4.5"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-app-surface-muted text-lg">
                {topic.icon}
              </div>
              <p className="m-0 text-sm font-semibold">{topic.name}</p>
              <p className="m-0 mt-0.5 text-xs text-ink-secondary">{topic.moduleName}</p>
              <p className="m-0 mt-2 text-xs text-ink-secondary">
                {topic.questionsAnswered > 0
                  ? `${topic.questionsAnswered} questions · ${topic.score}% accuracy`
                  : "Not started"}
              </p>
              <Link
                href={`/quiz/${topic.id}`}
                className="mt-3.5 w-full rounded-md bg-navy-900 py-2 text-center text-[12.5px] font-semibold text-white hover:bg-navy-800"
              >
                Practice
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <p className="m-0 text-sm text-ink-secondary">No topics are available yet for this subject.</p>
      )}
    </div>
  );
}
