import Link from "next/link";
import { getPapersForAdmin } from "@/lib/admin-papers";
import { getSubjectsForAdmin } from "@/lib/admin-topics";
import { getGrades, getPaperTypes, isValidGrade, labelForPaperType } from "@/lib/reference-data";
import { AdminPapersFilterForm } from "@/components/admin-papers-filter-form";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { deletePaper } from "./actions";

const STATUS_PILL_CLASSES: Record<"draft" | "published", string> = {
  draft: "bg-warn-bg text-warn",
  published: "bg-mastered-bg text-mastered",
};

const MEDIUM_LABELS: Record<"sinhala" | "tamil" | "english", string> = {
  sinhala: "Sinhala",
  tamil: "Tamil",
  english: "English",
};

export default async function AdminPapersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const rawGrade = typeof params.grade === "string" ? params.grade : "";
  const subjectId = typeof params.subjectId === "string" ? params.subjectId : "";
  const search = typeof params.search === "string" ? params.search : "";

  const [subjects, GRADES, PAPER_TYPES] = await Promise.all([
    getSubjectsForAdmin(),
    getGrades(),
    getPaperTypes(),
  ]);
  const grade = rawGrade && isValidGrade(rawGrade, GRADES) ? rawGrade : "";

  const papersList = await getPapersForAdmin({
    subjectId: subjectId || undefined,
    grade: grade || undefined,
    search: search || undefined,
  });

  return (
    <>
      <div className="mb-4.5 flex items-end justify-between gap-3">
        <div>
          <h1 className="m-0 mb-1 text-lg font-bold text-navy-900">Papers</h1>
          <p className="m-0 text-[13px] text-ink-secondary">Create and manage past exam papers.</p>
        </div>
        <Link
          href="/admin/papers/new"
          className="shrink-0 rounded-md bg-navy-900 px-4.5 py-2 text-[13px] font-semibold text-white hover:bg-navy-800"
        >
          + Create Paper
        </Link>
      </div>

      <AdminPapersFilterForm
        grades={GRADES.map((g) => ({ value: g.value, label: g.label }))}
        subjects={subjects}
        selected={{ grade, subjectId, search }}
      />

      {papersList.length === 0 ? (
        <div className="rounded-[10px] border border-app-border bg-white p-4 text-sm text-ink-secondary">
          No papers match these filters.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-app-surface-muted text-left text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
                  <th className="px-3.5 py-2.5">Paper</th>
                  <th className="px-3.5 py-2.5">Subject</th>
                  <th className="px-3.5 py-2.5">Grade</th>
                  <th className="px-3.5 py-2.5">Medium</th>
                  <th className="px-3.5 py-2.5">Type</th>
                  <th className="px-3.5 py-2.5 text-right">Questions</th>
                  <th className="px-3.5 py-2.5">Status</th>
                  <th className="px-3.5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {papersList.map((paper) => (
                  <tr key={paper.id} className="border-b border-app-border last:border-b-0">
                    <td className="px-3.5 py-2.5 min-w-[180px] font-semibold text-navy-900">
                      {paper.title}
                      {paper.year ? <span className="ml-1.5 font-normal text-ink-secondary">({paper.year})</span> : null}
                    </td>
                    <td className="px-3.5 py-2.5 text-ink-secondary">{paper.subjectName}</td>
                    <td className="px-3.5 py-2.5 text-ink-secondary">Grade {paper.grade}</td>
                    <td className="px-3.5 py-2.5 text-ink-secondary">{MEDIUM_LABELS[paper.medium]}</td>
                    <td className="px-3.5 py-2.5 text-ink-secondary">{labelForPaperType(paper.paperType, PAPER_TYPES)}</td>
                    <td className="px-3.5 py-2.5 text-right text-ink-secondary">{paper.questionCount}</td>
                    <td className="px-3.5 py-2.5">
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_PILL_CLASSES[paper.status]}`}
                      >
                        {paper.status === "published" ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/admin/papers/${paper.id}/questions`}
                          className="rounded-md border border-app-border bg-white px-3 py-1.5 text-[12.5px] font-semibold hover:bg-app-surface-muted"
                        >
                          View Questions
                        </Link>
                        <Link
                          href={`/admin/papers/${paper.id}/edit`}
                          className="rounded-md border border-app-border bg-white px-3 py-1.5 text-[12.5px] font-semibold hover:bg-app-surface-muted"
                        >
                          Edit
                        </Link>
                        <form action={deletePaper}>
                          <input type="hidden" name="paperId" value={paper.id} />
                          <ConfirmSubmitButton
                            confirmMessage={
                              paper.questionCount > 0
                                ? `"${paper.title}" has ${paper.questionCount} question(s) attached. Deleting it will permanently delete all of them too. Continue?`
                                : `Delete "${paper.title}"? This cannot be undone.`
                            }
                            className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </ConfirmSubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
