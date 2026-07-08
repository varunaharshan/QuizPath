"use client";

import { useState } from "react";
import type { AdminQuestionDetail } from "@/lib/admin-questions";
import type { AdminTopic } from "@/lib/admin-topics";
import { updateQuestion } from "@/app/admin/papers/[paperId]/questions/actions";

const INPUT_CLASSES = "w-full rounded-md border border-app-border bg-white px-3 py-2 text-[13.5px] text-ink";
const LABEL_CLASSES = "mb-1.5 block text-[12px] font-bold text-ink-secondary";

type OptionDefaults = { text: string; imageUrl: string };

function optionDefaults(option: AdminQuestionDetail["options"][number] | undefined): OptionDefaults {
  return {
    text: option?.type === "text" ? option.content : "",
    imageUrl: option?.type === "image" ? option.content : "",
  };
}

const OPTION_LETTERS = ["A", "B", "C", "D"] as const;

// The Topic select is purely a client-side filter narrowing which
// Sub-topics are selectable — it's never itself submitted to the server.
// Only the chosen Sub-topic (subTopicId) is a real form field; that's the
// only thing updateQuestion actually writes to the DB (mcqs has no
// standalone "topic" column — see src/lib/admin-questions.ts).
export function QuestionEditForm({
  question,
  topics,
  paperId,
}: {
  question: AdminQuestionDetail;
  topics: AdminTopic[];
  paperId: string;
}) {
  const [selectedTopicId, setSelectedTopicId] = useState(question.moduleId ?? topics[0]?.id ?? "");
  const subTopicOptions = topics.find((t) => t.id === selectedTopicId)?.subTopics ?? [];
  const [selectedSubTopicId, setSelectedSubTopicId] = useState(question.subTopicId ?? subTopicOptions[0]?.id ?? "");

  function handleTopicChange(topicId: string) {
    setSelectedTopicId(topicId);
    const newSubTopics = topics.find((t) => t.id === topicId)?.subTopics ?? [];
    setSelectedSubTopicId(newSubTopics[0]?.id ?? "");
  }

  const optionDefaultsByLetter = OPTION_LETTERS.map((_, index) => optionDefaults(question.options[index]));

  return (
    <form action={updateQuestion} className="max-w-[720px] rounded-[10px] border border-app-border bg-white p-5">
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
              defaultValue={optionDefaultsByLetter[index].text}
              placeholder="Option text"
              className={`${INPUT_CLASSES} mb-2`}
            />
            <input
              type="text"
              name={`option${letter}ImageUrl`}
              defaultValue={optionDefaultsByLetter[index].imageUrl}
              placeholder="…or an image URL instead"
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

      <button
        type="submit"
        className="rounded-md bg-navy-900 px-4.5 py-2 text-[13px] font-semibold text-white hover:bg-navy-800"
      >
        Save Changes
      </button>
    </form>
  );
}
