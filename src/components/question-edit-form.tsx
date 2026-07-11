"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminQuestionDetail } from "@/lib/admin-questions";
import type { AdminTopic } from "@/lib/admin-topics";
import { updateQuestion } from "@/app/admin/papers/[paperId]/questions/actions";
import { QuizForm } from "@/components/quiz-form";
import type { QuizQuestion } from "@/lib/quiz";

const INPUT_CLASSES = "w-full rounded-md border border-app-border bg-white px-3 py-2 text-[13.5px] text-ink";
const LABEL_CLASSES = "mb-1.5 block text-[12px] font-bold text-ink-secondary";

const OPTION_LETTERS = ["A", "B", "C", "D"] as const;

// Preview never persists anything — saveAnswer/submitQuiz are the only
// hooks <QuizForm> has into the outside world (it has no attempt-id/DB/auth
// knowledge of its own), so a preview context just needs harmless stand-ins.
// saveAnswer is a true no-op (selecting an option only updates QuizForm's
// own local state); submitQuiz closes the panel instead of finalizing an
// attempt, since QuizForm's real submit button is otherwise the only exit
// and it's disabled until at least one option is picked.
async function noopSaveAnswer() {}

// Reads the form's live (possibly unsaved) values via FormData rather than
// requiring every field to be converted to controlled state — an
// uncontrolled <form>'s fields are still readable this way, so Preview can
// reflect in-progress edits without a bigger rewrite. Falls back to the
// original saved value only if a field is somehow missing from the form.
function buildPreviewQuestion(
  form: HTMLFormElement,
  original: AdminQuestionDetail,
  subTopicName: string | undefined,
): QuizQuestion {
  const data = new FormData(form);
  const text = (name: string) => (data.get(name) as string | null)?.trim() ?? "";

  const questionText = text("questionText") || original.questionText;
  const questionImageUrl = text("questionImageUrl");
  const hint = text("hint");

  return {
    id: original.id,
    questionText,
    questionImage: questionImageUrl ? { type: "image", content: questionImageUrl } : null,
    hint: hint || null,
    subTopicName: subTopicName ?? original.subTopicName,
    options: OPTION_LETTERS.map((letter, index) => ({
      type: "text" as const,
      content: text(`option${letter}`) || original.options[index]?.content || `Option ${letter}`,
    })),
  };
}

// The Topic select is purely a client-side filter narrowing which
// Sub-topics are selectable — it's never itself submitted to the server.
// Only the chosen Sub-topic (subTopicId) is a real form field; that's the
// only thing updateQuestion actually writes to the DB (mcqs has no
// standalone "topic" column — see src/lib/admin-questions.ts).
export function QuestionEditForm({
  question,
  topics,
  paperId,
  prevQuestionId,
  nextQuestionId,
  position,
  total,
}: {
  question: AdminQuestionDetail;
  topics: AdminTopic[];
  paperId: string;
  prevQuestionId: string | null;
  nextQuestionId: string | null;
  position: number;
  total: number;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedTopicId, setSelectedTopicId] = useState(question.moduleId ?? topics[0]?.id ?? "");
  const subTopicOptions = topics.find((t) => t.id === selectedTopicId)?.subTopics ?? [];
  const [selectedSubTopicId, setSelectedSubTopicId] = useState(question.subTopicId ?? subTopicOptions[0]?.id ?? "");
  const [isDirty, setIsDirty] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Bumped on every form field change so the memoized preview question
  // below re-derives from the form's current values — true live-updating
  // preview, not just a snapshot taken when the panel first opens.
  const [formVersion, setFormVersion] = useState(0);

  function handleTopicChange(topicId: string) {
    setSelectedTopicId(topicId);
    const newSubTopics = topics.find((t) => t.id === topicId)?.subTopics ?? [];
    setSelectedSubTopicId(newSubTopics[0]?.id ?? "");
    setIsDirty(true);
  }

  function handleFormChange() {
    setIsDirty(true);
    setFormVersion((v) => v + 1);
  }

  function navigateTo(targetId: string | null) {
    if (!targetId) return;
    if (isDirty && !window.confirm("You have unsaved changes. Leave without saving?")) {
      return;
    }
    router.push(`/admin/papers/${paperId}/questions/${targetId}/edit`);
  }

  const optionTextByLetter = OPTION_LETTERS.map((_, index) => question.options[index]?.content ?? "");

  const previewSubTopicName = subTopicOptions.find((s) => s.id === selectedSubTopicId)?.name;
  const [previewQuestion, setPreviewQuestion] = useState<QuizQuestion | null>(null);

  // Refs must only be read outside of render (event handlers/effects), so
  // the live-preview data is derived here rather than inline during render.
  // formVersion (bumped by handleFormChange) is the deliberate trigger for
  // re-deriving on every keystroke, so Preview stays live while open.
  useEffect(() => {
    if (!previewOpen || !formRef.current) {
      setPreviewQuestion(null);
      return;
    }
    setPreviewQuestion(buildPreviewQuestion(formRef.current, question, previewSubTopicName));
  }, [previewOpen, formVersion, question, previewSubTopicName]);

  return (
    <div className="max-w-[720px]">
      <div className="mb-3.5 flex items-center justify-between rounded-md border border-app-border bg-white px-4 py-2.5">
        <button
          type="button"
          disabled={!prevQuestionId}
          onClick={() => navigateTo(prevQuestionId)}
          className="rounded-md border border-app-border bg-white px-3 py-1.5 text-[12.5px] font-semibold hover:bg-app-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Prev
        </button>
        <span className="text-[12.5px] font-semibold text-ink-secondary">
          Question {position} of {total}
        </span>
        <button
          type="button"
          disabled={!nextQuestionId}
          onClick={() => navigateTo(nextQuestionId)}
          className="rounded-md border border-app-border bg-white px-3 py-1.5 text-[12.5px] font-semibold hover:bg-app-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next →
        </button>
      </div>

      <form
        ref={formRef}
        action={updateQuestion}
        onChange={handleFormChange}
        className="rounded-[10px] border border-app-border bg-white p-5"
      >
        <input type="hidden" name="mcqId" value={question.id} />
        <input type="hidden" name="paperId" value={paperId} />

        <div className="mb-3.5">
          <label className={LABEL_CLASSES}>Question Text</label>
          <textarea
            name="questionText"
            defaultValue={question.questionText}
            required
            rows={3}
            className={INPUT_CLASSES}
          />
        </div>

        <div className="mb-3.5">
          <label className={LABEL_CLASSES}>Question Image URL (optional)</label>
          <input
            type="text"
            name="questionImageUrl"
            defaultValue={question.questionImage?.content ?? ""}
            placeholder="https://…"
            className={INPUT_CLASSES}
          />
        </div>

        <div className="mb-3.5 grid grid-cols-2 gap-3.5">
          {OPTION_LETTERS.map((letter, index) => (
            <div key={letter} className="rounded-md border border-app-border p-3">
              <label className={LABEL_CLASSES}>Option {letter}</label>
              <input
                type="text"
                name={`option${letter}`}
                defaultValue={optionTextByLetter[index]}
                placeholder="Option text"
                required
                className={INPUT_CLASSES}
              />
            </div>
          ))}
        </div>

        <div className="mb-3.5 grid grid-cols-2 gap-3.5">
          <div>
            <label className={LABEL_CLASSES}>Correct Answer</label>
            <select name="correctAnswer" defaultValue={String(question.correctOption + 1)} required className={INPUT_CLASSES}>
              <option value="1">1 (Option A)</option>
              <option value="2">2 (Option B)</option>
              <option value="3">3 (Option C)</option>
              <option value="4">4 (Option D)</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLASSES}>Difficulty</label>
            <select name="difficulty" defaultValue={question.difficulty} required className={INPUT_CLASSES}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>

        <div className="mb-3.5 grid grid-cols-2 gap-3.5">
          <div>
            <label className={LABEL_CLASSES}>Topic</label>
            <select
              value={selectedTopicId}
              onChange={(e) => handleTopicChange(e.target.value)}
              className={INPUT_CLASSES}
            >
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASSES}>Sub-topic</label>
            <select
              name="subTopicId"
              value={selectedSubTopicId}
              onChange={(e) => setSelectedSubTopicId(e.target.value)}
              required
              className={INPUT_CLASSES}
            >
              {subTopicOptions.map((subTopic) => (
                <option key={subTopic.id} value={subTopic.id}>
                  {subTopic.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-3.5">
          <label className={LABEL_CLASSES}>Keywords (comma-separated)</label>
          <input
            type="text"
            name="keywords"
            defaultValue={question.keywords.join(", ")}
            className={INPUT_CLASSES}
          />
        </div>

        <div className="mb-4.5">
          <label className={LABEL_CLASSES}>Hint (optional)</label>
          <textarea
            name="hint"
            defaultValue={question.hint ?? ""}
            rows={2}
            placeholder="A nudge students can reveal before answering — never the answer itself"
            className={INPUT_CLASSES}
          />
        </div>

        <div className="flex gap-2.5">
          <button
            type="submit"
            className="rounded-md bg-navy-900 px-4.5 py-2 text-[13px] font-semibold text-white hover:bg-navy-800"
          >
            Save Changes
          </button>
          <button
            type="button"
            onClick={() => setPreviewOpen((v) => !v)}
            className="rounded-md border border-app-border bg-white px-4.5 py-2 text-[13px] font-semibold hover:bg-app-surface-muted"
          >
            {previewOpen ? "Hide Preview" : "👁 Preview"}
          </button>
        </div>
      </form>

      {previewOpen && previewQuestion && (
        <div className="mt-3.5 rounded-[10px] border border-app-border bg-quiz-bg p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="m-0 text-[12.5px] font-bold uppercase tracking-wide text-ink-secondary">
              Preview — as seen by students (reflects unsaved changes)
            </p>
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="rounded-md border border-app-border bg-white px-3 py-1 text-[12px] font-semibold hover:bg-app-surface-muted"
            >
              ✕ Close
            </button>
          </div>
          <QuizForm
            questions={[previewQuestion]}
            initialAnswers={{}}
            saveAnswer={noopSaveAnswer}
            submitQuiz={async () => setPreviewOpen(false)}
            submitLabel="Close Preview"
          />
        </div>
      )}
    </div>
  );
}
