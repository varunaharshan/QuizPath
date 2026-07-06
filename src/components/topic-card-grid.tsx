"use client";

import { useState } from "react";
import { TopicCard, type TopicCardData } from "./topic-card";

export type { TopicCardData };

export type SubjectTopicTab = {
  subjectId: string;
  subjectName: string;
  topics: TopicCardData[];
};

// Subject tab switcher + card grid for Practice by Topic. Tab switching is
// pure client state (no navigation/reload, per spec) — all subjects' data is
// fetched once server-side and handed down, so switching tabs is just
// picking which already-fetched group to render. <TopicCard> itself has no
// "use client" and imports nothing from @/lib/dashboard or @/lib/practice
// (both transitively hit the server-only-guarded @/db), so it's safe to
// share between this Client Component and the By Keyword search results
// page (a plain Server Component).
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
            <TopicCard key={topic.id} topic={topic} />
          ))}
        </div>
      ) : (
        <p className="m-0 text-sm text-ink-secondary">No topics are available yet for this subject.</p>
      )}
    </div>
  );
}
