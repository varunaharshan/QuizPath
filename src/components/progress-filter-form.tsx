"use client";

import { useRouter } from "next/navigation";

// Client Component with a cascading-dropdown shape (this app's standard
// pattern for a Grade/Subject filter that re-navigates rather than holding
// client state) — changing either select re-navigates to /progress with
// updated query params, and the Server Component page re-fetches and
// re-renders the KPI cards/topic table below for the new grade+subject.
// There's no "Start"-style action here (Progress is a live view, not
// something you launch), so there's no button — the selects themselves are
// the whole form.
export function ProgressFilterForm({
  grades,
  subjects,
  selected,
}: {
  grades: { value: string; label: string }[];
  subjects: { id: string; name: string }[];
  selected: { grade: string; subjectId: string };
}) {
  const router = useRouter();

  function navigateWith(overrides: Partial<{ grade: string; subjectId: string }>) {
    const params = new URLSearchParams({ grade: selected.grade, subjectId: selected.subjectId });
    for (const [key, value] of Object.entries(overrides)) {
      params.set(key, value);
    }
    router.push(`/progress?${params.toString()}`);
  }

  return (
    <div className="mb-4.5 max-w-[640px] rounded-[10px] border border-app-border bg-white p-5">
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
      </div>
    </div>
  );
}
