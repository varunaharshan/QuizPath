"use client";

import { useRouter } from "next/navigation";
import type { PaperAttemptStatus } from "@/lib/papers";

const BUTTON_LABEL: Record<PaperAttemptStatus, string> = {
  not_started: "Start Test →",
  in_progress: "Resume Test →",
  completed: "Retake Test →",
};

export type PaperOption = {
  id: string;
  title: string;
  year: number | null;
  status: PaperAttemptStatus;
};

// Client Component — cascading Grade/Subject/Paper Type dropdowns each
// re-navigate to /papers with updated query params (the Server Component
// page re-fetches the matching paper list server-side), while the Paper
// dropdown and "Start Test" button stay purely about picking one of the
// already-fetched papers and jumping to its existing quiz-taking route.
// A plain server-rendered form can't do the "change one select, get a new
// set of options in another" cascade without a client round-trip somewhere,
// so this mirrors the same "thin Client Component driven by Server
// Component data" shape as <QuizForm>.
export function PapersFilterForm({
  grades,
  subjects,
  paperTypes,
  papers,
  selected,
}: {
  grades: { value: string; label: string }[];
  subjects: { id: string; name: string }[];
  paperTypes: { value: string; label: string }[];
  papers: PaperOption[];
  selected: { grade: string; subjectId: string; type: string; paperId: string | null };
}) {
  const router = useRouter();

  function navigateWith(overrides: Partial<{ grade: string; subjectId: string; type: string; paper: string }>) {
    const params = new URLSearchParams({
      grade: selected.grade,
      subjectId: selected.subjectId,
      type: selected.type,
    });
    if (selected.paperId) params.set("paper", selected.paperId);
    for (const [key, value] of Object.entries(overrides)) {
      params.set(key, value);
    }
    // Changing grade/subject/type invalidates whichever paper was selected
    // under the old options — the Server Component picks a fresh default.
    if (overrides.grade || overrides.subjectId || overrides.type) {
      params.delete("paper");
    }
    router.push(`/papers?${params.toString()}`);
  }

  const selectedPaper = papers.find((p) => p.id === selected.paperId) ?? papers[0] ?? null;

  return (
    <div className="max-w-[640px] rounded-[10px] border border-app-border bg-white p-5">
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="mb-1.5 block text-[11.5px] font-bold uppercase tracking-wide text-ink-secondary">
            Grade
          </span>
          <select
            value={selected.grade}
            onChange={(e) => navigateWith({ grade: e.target.value })}
            className="w-full rounded-md border border-app-border bg-white px-2.5 py-2 text-[13.5px] text-ink"
          >
            {grades.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[11.5px] font-bold uppercase tracking-wide text-ink-secondary">
            Subject
          </span>
          <select
            value={selected.subjectId}
            onChange={(e) => navigateWith({ subjectId: e.target.value })}
            className="w-full rounded-md border border-app-border bg-white px-2.5 py-2 text-[13.5px] text-ink"
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[11.5px] font-bold uppercase tracking-wide text-ink-secondary">
            Paper Type
          </span>
          <select
            value={selected.type}
            onChange={(e) => navigateWith({ type: e.target.value })}
            className="w-full rounded-md border border-app-border bg-white px-2.5 py-2 text-[13.5px] text-ink"
          >
            {paperTypes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[11.5px] font-bold uppercase tracking-wide text-ink-secondary">
            Paper
          </span>
          <select
            value={selectedPaper?.id ?? ""}
            disabled={papers.length === 0}
            onChange={(e) => navigateWith({ paper: e.target.value })}
            className="w-full rounded-md border border-app-border bg-white px-2.5 py-2 text-[13.5px] text-ink disabled:bg-app-surface-muted"
          >
            {papers.length === 0 ? (
              <option value="">No papers available</option>
            ) : (
              papers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                  {p.year ? ` (${p.year})` : ""}
                </option>
              ))
            )}
          </select>
        </label>
      </div>

      <button
        type="button"
        disabled={!selectedPaper}
        onClick={() => selectedPaper && router.push(`/quiz/papers/${selectedPaper.id}`)}
        className="mt-4 w-full rounded-md bg-navy-900 py-2.5 text-[13.5px] font-semibold text-white hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {selectedPaper ? BUTTON_LABEL[selectedPaper.status] : "No papers available"}
      </button>
    </div>
  );
}
