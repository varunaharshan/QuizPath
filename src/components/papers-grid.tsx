"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

// Local types + labels, not imported from @/lib/papers — that module
// transitively imports @/db (server-only-guarded), so a Client Component
// importing it at runtime would fail at build time. Mirrors the same
// "thin Client Component, plain data shape" pattern <TopicCardGrid> already
// established for Practice by Topic.
type PaperStatus = "not_started" | "in_progress" | "completed";
type PaperTypeValue = "provincial" | "district" | "school";

const PAPER_TYPE_LABELS: Record<PaperTypeValue, string> = {
  provincial: "Provincial",
  district: "District",
  school: "School",
};

export type PaperCardData = {
  id: string;
  title: string;
  paperType: PaperTypeValue;
  year: number | null;
  questionCount: number;
  totalMarks: number;
  timeLimitMinutes: number | null;
  status: PaperStatus;
  // Only meaningful when status is "in_progress".
  answeredCount: number | null;
};

export type SubjectPaperTab = {
  subjectId: string;
  subjectName: string;
  papers: PaperCardData[];
};

function PaperGridCard({ paper, subjectId, grade }: { paper: PaperCardData; subjectId: string; grade: string }) {
  const metaParts = [
    `${paper.questionCount} question${paper.questionCount === 1 ? "" : "s"}`,
    `${paper.totalMarks} marks`,
  ];
  if (paper.timeLimitMinutes) metaParts.push(`~${paper.timeLimitMinutes} min`);

  return (
    <Link
      href={`/papers/${paper.id}?grade=${grade}&subjectId=${subjectId}`}
      className="flex flex-col rounded-[10px] border border-app-border bg-white p-4.5 hover:border-navy-600"
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <p className="m-0 text-sm font-semibold text-ink">{paper.title}</p>
        <span className="shrink-0 rounded-full bg-app-surface-muted px-2 py-0.5 text-[11px] font-semibold text-ink-secondary">
          {PAPER_TYPE_LABELS[paper.paperType]}
        </span>
      </div>
      {paper.year && <p className="m-0 mb-1.5 text-xs text-ink-secondary">{paper.year}</p>}
      <p className="m-0 mb-3 text-xs text-ink-secondary">{metaParts.join(" · ")}</p>

      <div className="mt-auto">
        {paper.status === "not_started" && (
          <p className="m-0 text-xs font-semibold text-ink-muted">Not started</p>
        )}
        {paper.status === "in_progress" && (
          <>
            <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-app-surface-muted">
              <div
                className="h-full rounded-full bg-progress"
                style={{
                  width: `${
                    paper.questionCount > 0
                      ? Math.round(((paper.answeredCount ?? 0) / paper.questionCount) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
            <p className="m-0 text-xs font-semibold text-progress">
              In progress · {paper.answeredCount ?? 0}/{paper.questionCount} answered
            </p>
          </>
        )}
        {paper.status === "completed" && (
          <>
            <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-app-surface-muted">
              <div className="h-full w-full rounded-full bg-mastered" />
            </div>
            <p className="m-0 text-xs font-semibold text-mastered">✓ Completed</p>
          </>
        )}
      </div>
    </Link>
  );
}

// Subject tab switcher + live search + card grid for the Papers browse
// screen. Grade is a real navigation/query-string param (handled by the
// Server Component page); Subject and Search are pure client state over
// data already fetched for the whole grade — the same "fetch once,
// tab-switch client-side" shape <TopicCardGrid> established for Practice by
// Topic, so switching subjects (or typing a search term) never round-trips
// to the server.
export function PapersGrid({ groups, grade }: { groups: SubjectPaperTab[]; grade: string }) {
  const [activeSubjectId, setActiveSubjectId] = useState(groups[0]?.subjectId ?? "");
  const [search, setSearch] = useState("");

  const active = groups.find((g) => g.subjectId === activeSubjectId) ?? groups[0];

  const filteredPapers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return active.papers;
    return active.papers.filter((p) => p.title.toLowerCase().includes(query));
  }, [active, search]);

  return (
    <div>
      <div className="mb-4.5 flex flex-wrap gap-2">
        {groups.map((group) => (
          <button
            key={group.subjectId}
            type="button"
            onClick={() => setActiveSubjectId(group.subjectId)}
            className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
              group.subjectId === active.subjectId
                ? "bg-navy-900 text-white"
                : "bg-app-surface-muted text-ink-secondary hover:bg-app-border"
            }`}
          >
            {group.subjectName}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search papers by title…"
        className="mb-4.5 w-full max-w-[360px] rounded-md border border-app-border bg-white px-3 py-2 text-[13.5px] text-ink"
      />

      {active.papers.length === 0 ? (
        <p className="m-0 text-sm text-ink-secondary">No papers are available yet for this subject.</p>
      ) : filteredPapers.length === 0 ? (
        <p className="m-0 text-sm text-ink-secondary">No papers match your search.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4.5 sm:grid-cols-2">
          {filteredPapers.map((paper) => (
            <PaperGridCard key={paper.id} paper={paper} subjectId={active.subjectId} grade={grade} />
          ))}
        </div>
      )}
    </div>
  );
}
