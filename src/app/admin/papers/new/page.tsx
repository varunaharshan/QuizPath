import Link from "next/link";
import { getSubjectsForAdmin } from "@/lib/admin-topics";
import { getGrades, getPaperTypes } from "@/lib/reference-data";
import { createPaper } from "../actions";

const INPUT_CLASSES = "w-full rounded-md border border-app-border bg-white px-3 py-2 text-[13.5px] text-ink";

export default async function NewPaperPage() {
  const [subjects, GRADES, PAPER_TYPES] = await Promise.all([getSubjectsForAdmin(), getGrades(), getPaperTypes()]);

  return (
    <>
      <h1 className="m-0 mb-1 text-lg font-bold text-navy-900">Create New Paper</h1>
      <p className="m-0 mb-4.5 text-[13px] text-ink-secondary">Add a new past exam paper to the question bank.</p>

      {subjects.length === 0 ? (
        <div className="max-w-[520px] rounded-[10px] border border-app-border bg-white p-4 text-sm text-ink-secondary">
          No subjects exist yet — add a subject before creating a paper.
        </div>
      ) : (
        <form action={createPaper} className="max-w-[520px] rounded-[10px] border border-app-border bg-white p-5">
          <div className="mb-3.5">
            <label className="mb-1.5 block text-[12px] font-bold text-ink-secondary">Paper Name</label>
            <input type="text" name="title" placeholder="e.g. 2024 Paper 1" required className={INPUT_CLASSES} />
          </div>

          <div className="mb-3.5 grid grid-cols-2 gap-3.5">
            <div>
              <label className="mb-1.5 block text-[12px] font-bold text-ink-secondary">Grade</label>
              <select name="grade" required defaultValue="" className={INPUT_CLASSES}>
                <option value="" disabled>
                  Select grade…
                </option>
                {GRADES.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-bold text-ink-secondary">Subject</label>
              <select name="subjectId" required defaultValue="" className={INPUT_CLASSES}>
                <option value="" disabled>
                  Select subject…
                </option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-3.5 grid grid-cols-2 gap-3.5">
            <div>
              <label className="mb-1.5 block text-[12px] font-bold text-ink-secondary">Paper Type</label>
              <select name="paperType" required defaultValue="" className={INPUT_CLASSES}>
                <option value="" disabled>
                  Select type…
                </option>
                {PAPER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-bold text-ink-secondary">Year (optional)</label>
              <input type="number" name="year" placeholder="2024" className={INPUT_CLASSES} />
            </div>
          </div>

          <div className="mb-3.5">
            <label className="mb-1.5 block text-[12px] font-bold text-ink-secondary">Medium</label>
            <select name="medium" required defaultValue="english" className={INPUT_CLASSES}>
              <option value="sinhala">Sinhala</option>
              <option value="tamil">Tamil</option>
              <option value="english">English</option>
            </select>
            <p className="m-0 mt-1 text-[11.5px] text-ink-secondary">
              Ignored for a subject with a fixed medium (e.g. English) — those papers always use the
              subject&apos;s own medium.
            </p>
          </div>

          <div className="mb-3.5">
            <label className="mb-1.5 block text-[12px] font-bold text-ink-secondary">
              Time Limit in Minutes (optional)
            </label>
            <input
              type="number"
              name="timeLimitMinutes"
              min="1"
              step="1"
              placeholder="e.g. 60"
              className={INPUT_CLASSES}
            />
          </div>

          <div className="flex gap-2.5">
            <button
              type="submit"
              className="rounded-md bg-navy-900 px-4.5 py-2 text-[13px] font-semibold text-white hover:bg-navy-800"
            >
              Create Paper
            </button>
            <Link
              href="/admin/papers"
              className="rounded-md border border-app-border bg-white px-4.5 py-2 text-[13px] font-semibold hover:bg-app-surface-muted"
            >
              Cancel
            </Link>
          </div>
        </form>
      )}
    </>
  );
}
