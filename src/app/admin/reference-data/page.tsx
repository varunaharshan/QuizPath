import { getSubjectsWithMedium, getGrades, getPaperTypes } from "@/lib/reference-data";
import { createGrade, createPaperType, createSubject } from "./actions";

const INPUT_CLASSES = "w-full rounded-md border border-app-border bg-white px-3 py-2 text-[13.5px] text-ink";

const MEDIUM_LABELS: Record<"sinhala" | "tamil" | "english", string> = {
  sinhala: "Sinhala",
  tamil: "Tamil",
  english: "English",
};

// Grades/Subjects/Paper Types were, until this pass, hardcoded literal
// arrays/enums scattered across the codebase (see the header comment in
// src/lib/reference-data.ts) — this page is the one place an admin can grow
// any of the three without a code change/deploy. Deliberately list-plus-add
// only, no edit/delete: reordering, renaming, or removing a value that's
// already referenced by student_profiles/modules/papers/subjects rows is a
// bigger, separate feature (would need the same "warn, don't block" cascade
// story Topics/Papers management already have for delete) and wasn't part of
// this batch's scope.
export default async function ReferenceDataPage() {
  const [gradeList, paperTypeList, subjectList] = await Promise.all([
    getGrades(),
    getPaperTypes(),
    getSubjectsWithMedium(),
  ]);

  return (
    <>
      <h1 className="m-0 mb-1 text-lg font-bold text-navy-900">Reference Data</h1>
      <p className="m-0 mb-4.5 text-[13px] text-ink-secondary">
        Manage the Grades, Subjects, and Paper Types available across the app. New values become
        selectable everywhere immediately — there&apos;s no separate publish step.
      </p>

      <div className="grid grid-cols-1 gap-4.5 lg:grid-cols-3">
        <section className="rounded-[10px] border border-app-border bg-white p-4.5">
          <h2 className="m-0 mb-3 text-[14px] font-bold text-navy-900">Grades</h2>

          {gradeList.length === 0 ? (
            <p className="m-0 mb-3.5 text-[13px] text-ink-secondary">No grades yet.</p>
          ) : (
            <ul className="m-0 mb-3.5 list-none space-y-1.5 p-0">
              {gradeList.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between rounded-md border border-app-border bg-app-surface-muted px-3 py-1.5 text-[13px] text-ink"
                >
                  <span className="font-semibold">{g.label}</span>
                  <span className="text-ink-secondary">{g.value}</span>
                </li>
              ))}
            </ul>
          )}

          <form action={createGrade} className="space-y-2.5 border-t border-app-border pt-3.5">
            <div>
              <label className="mb-1 block text-[12px] font-bold text-ink-secondary">Value</label>
              <input type="text" name="value" placeholder="e.g. 9" required className={INPUT_CLASSES} />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-bold text-ink-secondary">Label</label>
              <input type="text" name="label" placeholder="e.g. Grade 9" required className={INPUT_CLASSES} />
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-navy-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-navy-800"
            >
              + Add Grade
            </button>
          </form>
        </section>

        <section className="rounded-[10px] border border-app-border bg-white p-4.5">
          <h2 className="m-0 mb-3 text-[14px] font-bold text-navy-900">Subjects</h2>

          {subjectList.length === 0 ? (
            <p className="m-0 mb-3.5 text-[13px] text-ink-secondary">No subjects yet.</p>
          ) : (
            <ul className="m-0 mb-3.5 list-none space-y-1.5 p-0">
              {subjectList.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-md border border-app-border bg-app-surface-muted px-3 py-1.5 text-[13px] text-ink"
                >
                  <span className="font-semibold">{s.name}</span>
                  {s.fixedMedium && <span className="text-ink-secondary">{MEDIUM_LABELS[s.fixedMedium]}</span>}
                </li>
              ))}
            </ul>
          )}

          <form action={createSubject} className="space-y-2.5 border-t border-app-border pt-3.5">
            <div>
              <label className="mb-1 block text-[12px] font-bold text-ink-secondary">Name</label>
              <input type="text" name="name" placeholder="e.g. Mathematics" required className={INPUT_CLASSES} />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-bold text-ink-secondary">Fixed Medium (optional)</label>
              <select name="fixedMedium" defaultValue="" className={INPUT_CLASSES}>
                <option value="">None (follows student&apos;s medium)</option>
                <option value="sinhala">Sinhala</option>
                <option value="tamil">Tamil</option>
                <option value="english">English</option>
              </select>
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-navy-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-navy-800"
            >
              + Add Subject
            </button>
          </form>
        </section>

        <section className="rounded-[10px] border border-app-border bg-white p-4.5">
          <h2 className="m-0 mb-3 text-[14px] font-bold text-navy-900">Paper Types</h2>

          {paperTypeList.length === 0 ? (
            <p className="m-0 mb-3.5 text-[13px] text-ink-secondary">No paper types yet.</p>
          ) : (
            <ul className="m-0 mb-3.5 list-none space-y-1.5 p-0">
              {paperTypeList.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded-md border border-app-border bg-app-surface-muted px-3 py-1.5 text-[13px] text-ink"
                >
                  <span className="font-semibold">{t.label}</span>
                  <span className="text-ink-secondary">{t.value}</span>
                </li>
              ))}
            </ul>
          )}

          <form action={createPaperType} className="space-y-2.5 border-t border-app-border pt-3.5">
            <div>
              <label className="mb-1 block text-[12px] font-bold text-ink-secondary">Value</label>
              <input type="text" name="value" placeholder="e.g. zonal" required className={INPUT_CLASSES} />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-bold text-ink-secondary">Label</label>
              <input type="text" name="label" placeholder="e.g. Zonal" required className={INPUT_CLASSES} />
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-navy-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-navy-800"
            >
              + Add Paper Type
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
