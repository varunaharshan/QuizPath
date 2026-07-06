import Link from "next/link";

// Plain presentational component — no "use client", no imports from
// @/lib/dashboard or @/lib/practice (both transitively hit the
// server-only-guarded @/db). That keeps it safe to use from both a Server
// Component (e.g. the By Keyword search results page) and a Client
// Component (<TopicCardGrid>'s tab switcher): all data, including the icon,
// is precomputed by whichever Server Component page renders it.
export type TopicCardData = {
  id: string;
  name: string;
  moduleName: string;
  icon: string;
  score: number | null;
  questionsAnswered: number;
};

export function TopicCard({ topic }: { topic: TopicCardData }) {
  return (
    <div className="flex flex-col rounded-[10px] border border-app-border bg-white p-4.5">
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
  );
}
