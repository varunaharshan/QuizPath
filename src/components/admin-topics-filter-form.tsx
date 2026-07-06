"use client";

import { useRouter } from "next/navigation";

// Mirrors <ProgressFilterForm>'s exact cascading-dropdown shape (see
// src/components/progress-filter-form.tsx) — changing either select
// re-navigates to /admin/topics with updated query params, and the Server
// Component page re-fetches the topic tree for the new subject+grade.
export function AdminTopicsFilterForm({
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
    router.push(`/admin/topics?${params.toString()}`);
  }

  return (
    <div className="mb-4.5 max-w-[480px] rounded-[10px] border border-app-border bg-white p-5">
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
