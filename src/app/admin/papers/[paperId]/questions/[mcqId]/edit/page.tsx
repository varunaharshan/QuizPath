import Link from "next/link";
import { notFound } from "next/navigation";
import { getPaperForQuestionsAdmin, getQuestionForEdit } from "@/lib/admin-questions";
import { getTopicsForSubjectGrade } from "@/lib/admin-topics";
import { QuestionEditForm } from "@/components/question-edit-form";

// A real resource lookup by id, not a free browsing choice — an unknown
// paperId/mcqId 404s, and a mcqId that doesn't actually belong to this
// paperId also 404s rather than silently rendering the wrong question.
export default async function EditQuestionPage({
  params,
}: {
  params: Promise<{ paperId: string; mcqId: string }>;
}) {
  const { paperId, mcqId } = await params;
  const [paper, question] = await Promise.all([
    getPaperForQuestionsAdmin(paperId),
    getQuestionForEdit(mcqId),
  ]);
  if (!paper || !question || question.paperId !== paperId) {
    notFound();
  }

  const topics = await getTopicsForSubjectGrade(paper.subjectId, paper.grade);

  return (
    <>
      <h1 className="m-0 mb-1 text-lg font-bold text-navy-900">Edit Question</h1>
      <p className="m-0 mb-4.5 text-[13px] text-ink-secondary">{paper.title}</p>

      {topics.length === 0 ? (
        <div className="max-w-[520px] rounded-[10px] border border-app-border bg-white p-4 text-sm text-ink-secondary">
          No topics exist yet for Grade {paper.grade} {paper.subjectName} — create one in{" "}
          <Link href="/admin/topics" className="font-medium text-progress underline">
            Topics
          </Link>{" "}
          before reassigning this question.
        </div>
      ) : (
        <>
          <QuestionEditForm question={question} topics={topics} paperId={paperId} />
          <p className="mt-3">
            <Link
              href={`/admin/papers/${paperId}/questions`}
              className="text-[13px] font-semibold text-ink-secondary underline"
            >
              ← Back without saving
            </Link>
          </p>
        </>
      )}
    </>
  );
}
