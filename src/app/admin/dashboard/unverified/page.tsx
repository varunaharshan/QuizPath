import Link from "next/link";
import { getUnverifiedQuestions } from "@/lib/admin-dashboard";

// The Admin Dashboard's "Pending Review" KPI click-through — every
// unverified question site-wide, regardless of which paper (or no paper) it
// belongs to. There's no global question-bank edit view yet (see CLAUDE.md
// "What's NOT built yet"), so a paper-attached row links into the existing
// per-paper edit route; a standalone (no-paper) question has no edit route
// to link to and renders as a plain read-only row instead of building that
// larger, explicitly-deferred feature out here.
export default async function UnverifiedQuestionsPage() {
  const questions = await getUnverifiedQuestions();

  return (
    <>
      <div className="mb-4.5 flex items-end justify-between gap-3">
        <div>
          <h1 className="m-0 mb-1 text-xl font-bold text-navy-900">Pending Review</h1>
          <p className="m-0 text-[13px] text-ink-secondary">
            {questions.length} unverified question{questions.length === 1 ? "" : "s"} across the platform
          </p>
        </div>
        <Link
          href="/admin/dashboard"
          className="rounded-md border border-app-border bg-white px-4.5 py-2 text-[13px] font-semibold hover:bg-app-surface-muted"
        >
          ← Back to Dashboard
        </Link>
      </div>

      {questions.length === 0 ? (
        <div className="rounded-[10px] border border-app-border bg-white p-4 text-sm text-ink-secondary">
          Nothing is pending review right now.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-app-surface-muted text-left text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
                  <th className="px-3.5 py-2.5">Question</th>
                  <th className="px-3.5 py-2.5">Subject</th>
                  <th className="px-3.5 py-2.5">Grade</th>
                  <th className="px-3.5 py-2.5">Paper</th>
                  <th className="px-3.5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr key={q.id} className="border-b border-app-border align-top last:border-b-0">
                    <td className="max-w-[400px] px-3.5 py-2.5 font-medium text-navy-900">{q.questionText}</td>
                    <td className="px-3.5 py-2.5 text-ink-secondary">{q.subjectName ?? "—"}</td>
                    <td className="px-3.5 py-2.5 text-ink-secondary">{q.grade ?? "—"}</td>
                    <td className="px-3.5 py-2.5 text-ink-secondary">{q.paperTitle ?? "— (standalone)"}</td>
                    <td className="px-3.5 py-2.5">
                      {q.paperId && (
                        <Link
                          href={`/admin/papers/${q.paperId}/questions/${q.id}/edit`}
                          className="rounded-md border border-app-border bg-white px-3 py-1.5 text-[12.5px] font-semibold hover:bg-app-surface-muted"
                        >
                          Review
                        </Link>
                      )}
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
