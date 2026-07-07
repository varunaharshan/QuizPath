"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Structurally the same cascading-query-string pattern as
// AdminTopicsFilterForm/ProgressFilterForm, plus a text search box. Unlike
// those, every field here is optional ("All Subjects"/"All Grades") — see
// getPapersForAdmin's own comment for why Papers Management doesn't force a
// single subject+grade the way student-facing browsing always does.
export function AdminPapersFilterForm({
  grades,
  subjects,
  selected,
}: {
  grades: { value: string; label: string }[];
  subjects: { id: string; name: string }[];
  selected: { grade: string; subjectId: string; search: string };
}) {
  const router = useRouter();
  const [search, setSearch] = useState(selected.search);

  function navigateWith(overrides: Partial<{ grade: string; subjectId: string; search: string }>) {
    const merged = { ...selected, ...overrides };
    const params = new URLSearchParams();
    if (merged.grade) params.set("grade", merged.grade);
    if (merged.subjectId) params.set("subjectId", merged.subjectId);
    if (merged.search) params.set("search", merged.search);
    router.push(`/admin/papers${params.size ? `?${params.toString()}` : ""}`);
  }

  return (
    <div className="mb-4.5 max-w-[720px] rounded-[10px] border border-app-border bg-white p-5">
      <div className="grid grid-cols-3 gap-4">
        <label className="block">
          <span className="mb-1.5 block text-[11.5px] font-bold uppercase tracking-wide text-ink-secondary">
            Grade
          </span>
          <select
            value={selected.grade}
            onChange={(e) => navigateWith({ grade: e.target.value })}
            className="w-full rounded-md border border-app-border bg-white px-2.5 py-2 text-[13.5px] text-ink"
          >
            <option value="">All Grades</option>
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
            <option value="">All Subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[11.5px] font-bold uppercase tracking-wide text-ink-secondary">
            Search
          </span>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              navigateWith({ search });
            }}
            className="flex gap-2"
          >
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search papers…"
              className="w-full min-w-0 flex-1 rounded-md border border-app-border bg-white px-2.5 py-2 text-[13.5px] text-ink"
            />
            <button
              type="submit"
              className="shrink-0 rounded-md border border-app-border bg-white px-3 py-2 text-[13px] font-semibold hover:bg-app-surface-muted"
            >
              Search
            </button>
          </form>
        </label>
      </div>
    </div>
  );
}
