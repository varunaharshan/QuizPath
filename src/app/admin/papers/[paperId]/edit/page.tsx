import Link from "next/link";
import { notFound } from "next/navigation";
import { getPaperForAdmin } from "@/lib/admin-papers";
import { getSubjectsForAdmin } from "@/lib/admin-topics";
import { getGrades, getPaperTypes } from "@/lib/reference-data";
import { updatePaper } from "../../actions";

const INPUT_CLASSES = "w-full rounded-md border border-app-border bg-white px-3 py-2 text-[13.5px] text-ink";

// A dedicated page rather than an inline row-form (unlike Topics'
// single-field rename) — editing a paper touches several fields at once, so
// it gets its own form the same shape as Create, pre-filled. A real resource
// lookup by id, not a free browsing choice, so an unknown paperId 404s
// rather than falling back to a default.
export default async function EditPaperPage({ params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;
  const [paper, subjects, GRADES, PAPER_TYPES] = await Promise.all([
    getPaperForAdmin(paperId),
    getSubjectsForAdmin(),
    getGrades(),
    getPaperTypes(),
  ]);
  if (!paper) {
    notFound();
  }

  return (
    <>
      <h1 className="m-0 mb-1 text-lg font-bold text-navy-900">Edit Paper</h1>
      <p className="m-0 mb-4.5 text-[13px] text-ink-secondary">Update this paper&apos;s details.</p>

      <form action={updatePaper} className="max-w-[520px] rounded-[10px] border border-app-border bg-white p-5">
        <input type="hidden" name="paperId" value={paper.id} />

        <div className="mb-3.5">
          <label className="mb-1.5 block text-[12px] font-bold text-ink-secondary">Paper Name</label>
          <input type="text" name="title" defaultValue={paper.title} required className={INPUT_CLASSES} />
        </div>

        <div className="mb-3.5 grid grid-cols-2 gap-3.5">
          <div>
            <label className="mb-1.5 block text-[12px] font-bold text-ink-secondary">Grade</label>
            <select name="grade" required defaultValue={paper.grade} className={INPUT_CLASSES}>
              {GRADES.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-bold text-ink-secondary">Subject</label>
            <select name="subjectId" required defaultValue={paper.subjectId} className={INPUT_CLASSES}>
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
            <select name="paperType" required defaultValue={paper.paperType} className={INPUT_CLASSES}>
              {PAPER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-bold text-ink-secondary">Year (optional)</label>
            <input type="number" name="year" defaultValue={paper.year ?? ""} className={INPUT_CLASSES} />
          </div>
        </div>

        <div className="mb-3.5">
          <label className="mb-1.5 block text-[12px] font-bold text-ink-secondary">Medium</label>
          <select name="medium" required defaultValue={paper.medium} className={INPUT_CLASSES}>
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
            defaultValue={paper.timeLimitMinutes ?? ""}
            className={INPUT_CLASSES}
          />
        </div>

        <div className="mb-4.5">
          <label className="mb-1.5 block text-[12px] font-bold text-ink-secondary">Status</label>
          <select name="status" required defaultValue={paper.status} className={INPUT_CLASSES}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </div>

        <div className="flex gap-2.5">
          <button
            type="submit"
            className="rounded-md bg-navy-900 px-4.5 py-2 text-[13px] font-semibold text-white hover:bg-navy-800"
          >
            Save Changes
          </button>
          <Link
            href="/admin/papers"
            className="rounded-md border border-app-border bg-white px-4.5 py-2 text-[13px] font-semibold hover:bg-app-surface-muted"
          >
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
