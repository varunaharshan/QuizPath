"use client";

import { useState, useTransition } from "react";
import type { QuizQuestion } from "@/lib/quiz";
import { computeQuizProgress, jumpButtonStatus } from "@/lib/quiz-ui";

// Client Component, unlike this codebase's usual "no client JS needed" quiz
// pages — required because true incremental auto-save (a Server Action call
// per answer, not just at final submit) and a Submit button that's live
// disabled/enabled as answers come in both need client-side state. Shared by
// both the sub-topic and paper quiz-taking pages; only the bound Server
// Actions passed in differ.
//
// Visual design (stats row, card layout, lettered A/B/C/D option markers,
// jump grid) is adapted from docs/quiz-taking-mockup-reference.html, but
// several of that mockup's BEHAVIORS are deliberately not carried over:
// no immediate per-answer correct/incorrect feedback (nothing is revealed
// until the results page), no hints, no "Reset test" affordance, and the
// jump grid never shows correct/wrong coloring pre-submission — see
// CLAUDE.md "Quiz-taking flow" for why.
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
  const [current, setCurrent] = useState(0);
  const [showJumpGrid, setShowJumpGrid] = useState(false);
  const [isPending, startTransition] = useTransition();

  const total = questions.length;
  const answeredCount = Object.keys(answers).length;
  const { remaining } = computeQuizProgress(total, answeredCount);
  const question = questions[current];
  const selectedOption = answers[question.id];

  function handleSelect(optionIndex: number) {
    setAnswers((prev) => ({ ...prev, [question.id]: optionIndex }));
    startTransition(async () => {
      await saveAnswer(question.id, optionIndex);
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
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3" data-testid="quiz-stats">
        <div className="rounded-lg border border-app-border bg-app-surface-muted p-4 text-center">
          <span className="block text-2xl font-bold text-navy-900" data-testid="stat-answered">
            {answeredCount}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
            Answered
          </span>
        </div>
        <div className="rounded-lg border border-app-border bg-app-surface-muted p-4 text-center">
          <span className="block text-2xl font-bold text-navy-900" data-testid="stat-remaining">
            {remaining}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
            Remaining
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-app-border bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-ink-secondary">
          <span className="font-bold text-navy-900">
            Q{current + 1} of {total}
          </span>
          {question.subTopicName && (
            <span className="rounded-md bg-progress-bg px-2 py-0.5 text-[11.5px] font-semibold text-progress">
              {question.subTopicName}
            </span>
          )}
        </div>
        <p className="mb-4 text-[15px] leading-relaxed text-ink">{question.questionText}</p>
        <div className="flex flex-col gap-2.5">
          {question.options.map((option, optionIndex) => {
            const isSelected = selectedOption === optionIndex;
            return (
              <label
                key={optionIndex}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors ${
                  isSelected
                    ? "border-navy-900 bg-progress-bg"
                    : "border-app-border bg-white hover:border-navy-600"
                }`}
              >
                <input
                  type="radio"
                  name={`mcq:${question.id}`}
                  className="sr-only"
                  checked={isSelected}
                  onChange={() => handleSelect(optionIndex)}
                />
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isSelected ? "bg-navy-900 text-white" : "bg-app-surface-muted text-ink-secondary"
                  }`}
                >
                  {String.fromCharCode(65 + optionIndex)}
                </span>
                <span>{option}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={current === 0}
            onClick={() => setCurrent((c) => c - 1)}
            className="rounded-full border border-app-border bg-white px-4.5 py-2 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Prev
          </button>
          <button
            type="button"
            disabled={current === total - 1}
            onClick={() => setCurrent((c) => c + 1)}
            className="rounded-full bg-navy-900 px-4.5 py-2 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next →
          </button>
        </div>
        <p className="text-[13px] text-ink-secondary">
          {answeredCount} / {total} answered
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-app-border pt-4">
        <button
          type="button"
          onClick={() => setShowJumpGrid((v) => !v)}
          className="rounded-full border border-app-border bg-white px-4.5 py-2 text-[12.5px] font-semibold"
        >
          Question map
        </button>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            disabled={answeredCount === 0 || isPending}
            onClick={handleSubmit}
            className="rounded-full bg-navy-900 px-6 py-3 font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitLabel}
          </button>
          {answeredCount === 0 && (
            <p className="text-xs text-ink-secondary">Answer at least 1 question to submit.</p>
          )}
        </div>
      </div>

      {showJumpGrid && (
        <div className="grid grid-cols-10 gap-1.5" data-testid="jump-grid">
          {questions.map((q, index) => {
            // revealed is always false: nothing is graded/shown to the
            // student until they submit and reach the results page.
            const status = jumpButtonStatus({
              isAnswered: answers[q.id] !== undefined,
              isCorrect: false,
              revealed: false,
            });
            const isCurrent = index === current;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setCurrent(index)}
                data-testid="jump-btn"
                data-status={status}
                data-current={isCurrent}
                className={`h-9 rounded-md border text-xs font-semibold ${
                  isCurrent ? "border-navy-900 ring-2 ring-navy-600/40" : "border-app-border"
                } ${status === "answered" ? "bg-progress-bg text-progress" : "bg-white text-ink-secondary"}`}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
