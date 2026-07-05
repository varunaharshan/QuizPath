"use client";

import { useState, useTransition } from "react";
import type { QuizQuestion } from "@/lib/quiz";

// Client Component, unlike this codebase's usual "no client JS needed" quiz
// pages — required here because true incremental auto-save (a Server Action
// call per answer, not just at final submit) and a Submit button that's live
// disabled/enabled as answers come in both need client-side state. Shared by
// both the sub-topic and paper quiz-taking pages since the UI and save/submit
// gating logic are identical between them; only the bound Server Actions
// passed in differ.
export function QuizForm({
  questions,
  initialAnswers,
  saveAnswer,
  submitQuiz,
  submitLabel = "Submit quiz",
}: {
  questions: QuizQuestion[];
  initialAnswers: Record<string, number>;
  saveAnswer: (mcqId: string, selectedOption: number) => Promise<void>;
  submitQuiz: () => Promise<void>;
  submitLabel?: string;
}) {
  const [answers, setAnswers] = useState<Record<string, number>>(initialAnswers);
  const [isPending, startTransition] = useTransition();

  const answeredCount = Object.keys(answers).length;
  const total = questions.length;

  function handleSelect(mcqId: string, selectedOption: number) {
    setAnswers((prev) => ({ ...prev, [mcqId]: selectedOption }));
    startTransition(async () => {
      await saveAnswer(mcqId, selectedOption);
    });
  }

  function handleSubmit() {
    if (answeredCount < total) {
      const confirmed = window.confirm(
        `You've answered ${answeredCount} of ${total} questions. Submit anyway?`,
      );
      if (!confirmed) return;
    }
    startTransition(async () => {
      await submitQuiz();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {questions.map((question, index) => (
        <fieldset
          key={question.id}
          className="rounded-lg border border-black/10 p-5 dark:border-white/15"
        >
          <legend className="px-1 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Question {index + 1} of {total}
          </legend>
          <p className="mt-1 font-medium">{question.questionText}</p>
          <div className="mt-4 flex flex-col gap-2">
            {question.options.map((option, optionIndex) => (
              <label
                key={optionIndex}
                className="flex items-center gap-3 rounded-md border border-black/10 px-4 py-3 text-sm hover:bg-black/[.03] dark:border-white/15 dark:hover:bg-white/[.05]"
              >
                <input
                  type="radio"
                  name={`mcq:${question.id}`}
                  checked={answers[question.id] === optionIndex}
                  onChange={() => handleSelect(question.id, optionIndex)}
                  className="h-4 w-4"
                />
                {option}
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={answeredCount === 0 || isPending}
          onClick={handleSubmit}
          className="rounded-full bg-foreground px-6 py-3 font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-[#ccc]"
        >
          {submitLabel}
        </button>
        {answeredCount === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Answer at least 1 question to submit.
          </p>
        )}
      </div>
    </div>
  );
}
