import Link from "next/link";
import { iconForModule, type SubTopicStatus, type SubTopicStatusLabel } from "@/lib/dashboard";

const BADGE_STYLE: Record<SubTopicStatusLabel, string> = {
  needs_work: "bg-warn-bg text-warn",
  in_progress: "bg-progress-bg text-progress",
  mastered: "bg-mastered-bg text-mastered",
  not_started: "bg-app-surface-muted text-ink-muted",
};

// Shared row layout for the three Practice sub-pages (Weak Areas, By Topic,
// By Keyword) — each is a differently-filtered view over the same
// SubTopicStatus data, so the actual list presentation (icon, name, meta,
// score badge, Practice button linking to the existing /quiz/[subTopicId]
// route) is identical across all three rather than duplicated per page.
export function TopicPracticeList({
  topics,
  emptyMessage,
}: {
  topics: SubTopicStatus[];
  emptyMessage: string;
}) {
  if (topics.length === 0) {
    return <p className="p-4 text-sm text-ink-secondary">{emptyMessage}</p>;
  }

  return (
    <div>
      {topics.map((topic, index) => (
        <div
          key={topic.id}
          className={`flex items-center gap-3.5 px-4.5 py-3.5 ${index > 0 ? "border-t border-app-border" : ""}`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-app-surface-muted text-base">
            {iconForModule(topic.moduleName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="m-0 text-sm font-semibold">{topic.name}</p>
            <p className="m-0 mt-0.5 text-xs text-ink-secondary">
              {topic.moduleName} ·{" "}
              {topic.questionsAnswered > 0
                ? `${topic.questionsAnswered} questions answered`
                : "Not started yet"}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${BADGE_STYLE[topic.label]}`}>
            {topic.score === null ? "—" : `${topic.score}%`}
          </span>
          <Link
            href={`/quiz/${topic.id}`}
            className="shrink-0 rounded-md border border-app-border bg-white px-3.5 py-1.5 text-[12.5px] font-semibold hover:bg-app-surface-muted"
          >
            Practice
          </Link>
        </div>
      ))}
    </div>
  );
}
