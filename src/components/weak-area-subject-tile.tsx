import Link from "next/link";
import { iconForSubject } from "@/lib/dashboard";
import type { WeakAreaSubjectGroup } from "@/lib/practice";

// One subject tile for the Weak Areas grid: header (icon + subject name +
// rollup accuracy %) with a "View All" link, then up to `limit` (set by
// groupWeakAreasBySubject) weakest sub-topic rows, each with its own
// Practice button — styled after the Dashboard's existing card/row pattern
// (see "Recommended practice" in src/app/dashboard/page.tsx) rather than a
// new visual language.
export function WeakAreaSubjectTile({ group }: { group: WeakAreaSubjectGroup }) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
      <div className="flex items-center justify-between border-b border-app-border px-4.5 py-3.5">
        <span className="text-[13.5px] font-bold text-navy-900">
          {iconForSubject(group.subjectName)} {group.subjectName} · {Math.round(group.accuracy)}%
        </span>
        <Link
          href={`/practice/weak-areas?subjectId=${group.subjectId}`}
          className="text-[12.5px] font-semibold text-progress hover:underline"
        >
          View All →
        </Link>
      </div>
      <div className="p-4">
        {group.topics.map((topic, index) => (
          <div
            key={topic.id}
            className={`flex items-center justify-between gap-3 py-2.5 ${index > 0 ? "border-t border-app-border" : ""}`}
          >
            <div className="min-w-0">
              <p className="m-0 truncate text-[13.5px] font-semibold">{topic.name}</p>
              <p className="m-0 mt-0.5 text-xs text-warn">
                {topic.score === null ? "Not started yet" : `${topic.score}% accuracy · ${topic.questionsAnswered} questions`}
              </p>
            </div>
            <Link
              href={`/quiz/${topic.id}`}
              className="shrink-0 rounded-md border border-app-border bg-white px-3.5 py-1.5 text-[12.5px] font-semibold hover:bg-app-surface-muted"
            >
              Practice
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
