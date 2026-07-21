import Link from "next/link";
import { notFound } from "next/navigation";
import { getPaperForQuestionsAdmin, getQuestionsForPaper } from "@/lib/admin-questions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { QuestionOptionPreview } from "@/components/question-option-preview";
import { deleteQuestion, publishAllQuestions, setQuestionStatus, setVerificationStatus } from "./actions";

const DELETE_BUTTON_CLASSES =
  "rounded-md border border-red-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-red-600 hover:bg-red-50";

// A real resource lookup by id (like Papers' own edit page), not a free
// browsing choice, so an unknown paperId 404s rather than falling back to a
// default.
export default async function PaperQuestionsPage({ params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;
  const paper = await getPaperForQuestionsAdmin(paperId);
  if (!paper) {
    notFound();
  }

  const questions = await getQuestionsForPaper(paperId);
  const publishedCount = questions.filter((q) => q.status === "published").length;

  return (
    <>
      <div className="mb-4.5 flex items-end justify-between gap-3">
        <div>
          <h1 className="m-0 mb-1 text-xl font-bold text-navy-900">{paper.title} — Questions</h1>
          <p className="m-0 text-[13px] text-ink-secondary">
            Grade {paper.grade} · {questions.length} question{questions.length === 1 ? "" : "s"} ·{" "}
            {publishedCount} of {questions.length} published
          </p>
        </div>
        <div className="flex shrink-0 gap-2.5">
          {questions.length > 0 && publishedCount < questions.length && (
            <form>
              <ConfirmSubmitButton
                formAction={publishAllQuestions.bind(null, paperId)}
                confirmMessage={`Publish all ${questions.length - publishedCount} draft question(s) in this paper? They'll immediately become visible to students.`}
                className="rounded-md bg-mastered px-4.5 py-2 text-[13px] font-semibold text-white hover:opacity-90"
              >
                Publish All
              </ConfirmSubmitButton>
            </form>
          )}
          <Link
            href="/admin/papers"
            className="rounded-md border border-app-border bg-white px-4.5 py-2 text-[13px] font-semibold hover:bg-app-surface-muted"
          >
            ← Back to Papers
          </Link>
        </div>
      </div>

      {questions.length === 0 ? (
        <div className="rounded-[10px] border border-app-border bg-white p-4 text-sm text-ink-secondary">
          No questions have been added to this paper yet — use{" "}
          <Link href="/admin/questions/bulk-upload" className="font-medium text-progress underline">
            Bulk Upload
          </Link>{" "}
          with &quot;{paper.title}&quot; as the Paper Reference.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-app-surface-muted text-left text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
                  <th className="px-3.5 py-2.5">#</th>
                  <th className="px-3.5 py-2.5">Question</th>
                  <th className="px-3.5 py-2.5">Correct Answer</th>
                  <th className="px-3.5 py-2.5">Topic</th>
                  <th className="px-3.5 py-2.5">Sub-topic</th>
                  <th className="px-3.5 py-2.5">Difficulty</th>
                  <th className="px-3.5 py-2.5">Keywords</th>
                  <th className="px-3.5 py-2.5">Status</th>
                  <th className="px-3.5 py-2.5">Verified</th>
                  <th className="px-3.5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {questions.map((q, index) => {
                  const correctOption = q.options[q.correctOption];
                  return (
                    <tr key={q.id} className="border-b border-app-border align-top last:border-b-0">
                      <td className="px-3.5 py-2.5 text-ink-muted">{index + 1}</td>
                      <td className="px-3.5 py-2.5 max-w-[300px] font-medium text-navy-900">
                        {q.questionImage && <span className="mr-1 text-ink-muted">[img]</span>}
                        {q.questionText}
                        {q.hint && (
                          <span className="mt-1 block text-[11px] font-normal text-ink-secondary">
                            💡 Has hint
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 max-w-[160px]">
                        {correctOption ? <QuestionOptionPreview option={correctOption} /> : "—"}
                      </td>
                      <td className="px-3.5 py-2.5 text-ink-secondary">{q.moduleName ?? "—"}</td>
                      <td className="px-3.5 py-2.5 text-ink-secondary">{q.subTopicName ?? "—"}</td>
                      <td className="px-3.5 py-2.5 text-ink-secondary capitalize">{q.difficulty}</td>
                      <td className="px-3.5 py-2.5 max-w-[160px] text-ink-secondary">
                        {q.keywords.length > 0 ? q.keywords.join(", ") : "—"}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <form>
                          {q.status === "published" ? (
                            <button
                              type="submit"
                              formAction={setQuestionStatus.bind(null, q.id, "draft", paperId)}
                              className="rounded-full bg-mastered-bg px-2.5 py-1 text-[11px] font-bold text-mastered"
                            >
                              Published
                            </button>
                          ) : (
                            <button
                              type="submit"
                              formAction={setQuestionStatus.bind(null, q.id, "published", paperId)}
                              className="rounded-full bg-app-surface-muted px-2.5 py-1 text-[11px] font-bold text-ink-secondary"
                            >
                              Draft
                            </button>
                          )}
                        </form>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <form>
                          {q.verificationStatus === "verified" ? (
                            <button
                              type="submit"
                              formAction={setVerificationStatus.bind(null, q.id, "unverified", paperId)}
                              className="rounded-full bg-mastered-bg px-2.5 py-1 text-[11px] font-bold text-mastered"
                            >
                              ✓ Verified
                            </button>
                          ) : (
                            <button
                              type="submit"
                              formAction={setVerificationStatus.bind(null, q.id, "verified", paperId)}
                              className="rounded-full bg-warn-bg px-2.5 py-1 text-[11px] font-bold text-warn"
                            >
                              Unverified
                            </button>
                          )}
                        </form>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/admin/papers/${paperId}/questions/${q.id}/edit`}
                            className="rounded-md border border-app-border bg-white px-3 py-1.5 text-[12.5px] font-semibold hover:bg-app-surface-muted"
                          >
                            Edit
                          </Link>
                          <form action={deleteQuestion}>
                            <input type="hidden" name="mcqId" value={q.id} />
                            <input type="hidden" name="paperId" value={paperId} />
                            <ConfirmSubmitButton
                              confirmMessage="Delete this question? This cannot be undone."
                              className={DELETE_BUTTON_CLASSES}
                            >
                              Delete
                            </ConfirmSubmitButton>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
