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
// jump grid) is adapted from docs/quiz-taking-mockup-reference.html, using
// that file's exact `--navy`/`--card-bg`/etc. hex values (the `quiz-*` tokens
// in globals.css) rather than the app shell's navy/gold brand palette — this
// screen is deliberately styled apart from Dashboard/Practice/Progress, see
// CLAUDE.md "Quiz-taking visual design". Several of the mockup's BEHAVIORS
// are deliberately not carried over though: no immediate per-answer
// correct/incorrect feedback (nothing is revealed until the results page),
// no hints, no "Reset test" affordance, and the jump grid never shows
// correct/wrong coloring pre-submission — see CLAUDE.md "Quiz-taking flow"
// for why.
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
  // Per-question, keyed by mcq id — collapsed by default, available whether
  // or not the student has answered yet, and never auto-collapsed once
  // answered (no special-casing on selectedOption below).
  const [expandedHints, setExpandedHints] = useState<Set<string>>(new Set());
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

  function toggleHint(mcqId: string) {
    setExpandedHints((prev) => {
      const next = new Set(prev);
      if (next.has(mcqId)) {
        next.delete(mcqId);
      } else {
        next.add(mcqId);
      }
      return next;
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
        <div className="rounded-lg bg-quiz-purple-bg p-4 text-center">
          <span className="block text-2xl font-bold text-quiz-purple-text" data-testid="stat-answered">
            {answeredCount}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wide text-quiz-purple-text opacity-85">
            Answered
          </span>
        </div>
        <div className="rounded-lg bg-quiz-grey-bg p-4 text-center">
          <span className="block text-2xl font-bold text-quiz-grey-text" data-testid="stat-remaining">
            {remaining}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wide text-quiz-grey-text opacity-85">
            Remaining
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-quiz-border bg-quiz-card-bg py-5 px-[22px]">
        <div className="mb-3.5 flex flex-wrap items-center gap-2.5 text-[13px] text-quiz-grey-text">
          <span className="font-bold text-quiz-navy">
            Q{current + 1} of {total}
          </span>
          {question.subTopicName && (
            <span className="rounded-md bg-quiz-purple-bg px-2 py-0.5 text-[11px] font-bold text-quiz-purple-text">
              {question.subTopicName}
            </span>
          )}
        </div>
        <p className="mb-4 text-[16px] leading-relaxed text-quiz-navy">{question.questionText}</p>
        {question.questionImage && (
          <img
            src={question.questionImage.content}
            alt="Question diagram"
            className="mb-4 max-h-72 max-w-full rounded-md"
          />
        )}
        {question.hint && (
          <div className="mb-4">
            <button
              type="button"
              onClick={() => toggleHint(question.id)}
              className="rounded-lg border border-quiz-option-border bg-white px-3.5 py-2 text-[12.5px] font-bold text-quiz-navy"
            >
              💡 {expandedHints.has(question.id) ? "Hide hint" : "Show hint"}
            </button>
            {expandedHints.has(question.id) && (
              <p className="mt-2.5 rounded-md bg-quiz-purple-bg px-3.5 py-2.5 text-[13.5px] leading-relaxed text-quiz-purple-text">
                {question.hint}
              </p>
            )}
          </div>
        )}
        <div className="mb-1.5 flex flex-col gap-2.5">
          {question.options.map((option, optionIndex) => {
            const isSelected = selectedOption === optionIndex;
            return (
              <label
                key={optionIndex}
                className={`flex cursor-pointer items-start gap-3 rounded-[10px] border bg-white px-4 py-3 text-[14.5px] leading-normal transition-colors ${
                  isSelected
                    ? "border-quiz-navy-light bg-quiz-navy-light/10"
                    : "border-quiz-option-border hover:border-quiz-navy-light"
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
                  className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold ${
                    isSelected ? "bg-quiz-navy-light text-white" : "bg-quiz-grey-bg text-quiz-grey-text"
                  }`}
                >
                  {String.fromCharCode(65 + optionIndex)}
                </span>
                <span>{option.content}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2.5">
          <button
            type="button"
            disabled={current === 0}
            onClick={() => setCurrent((c) => c - 1)}
            className="rounded-lg border border-quiz-option-border bg-white px-[18px] py-2.5 text-[13.5px] font-bold text-quiz-navy disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Prev
          </button>
          <button
            type="button"
            disabled={current === total - 1}
            onClick={() => setCurrent((c) => c + 1)}
            className="rounded-lg bg-quiz-navy px-[18px] py-2.5 text-[13.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next →
          </button>
        </div>
        <p className="text-[13px] text-quiz-grey-text">
          {answeredCount} / {total} answered
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-quiz-option-border pt-4">
        <button
          type="button"
          onClick={() => setShowJumpGrid((v) => !v)}
          className="rounded-lg border border-quiz-option-border bg-white px-3.5 py-2 text-[12.5px] font-bold text-quiz-navy"
        >
          Question map
        </button>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            disabled={answeredCount === 0 || isPending}
            onClick={handleSubmit}
            className="rounded-lg bg-quiz-navy px-[18px] py-2.5 text-[13.5px] font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitLabel}
          </button>
          {answeredCount === 0 && (
            <p className="text-xs text-quiz-grey-text">Answer at least 1 question to submit.</p>
          )}
        </div>
      </div>

      {showJumpGrid && (
        <div className="grid grid-cols-10 gap-1.5" data-testid="jump-grid">
          {questions.map((q, index) => {
            // revealed is always false: nothing is graded/shown to the
            // student until they submit and reach the results page. The
            // correct/incorrect branches (green/red per the mockup) are
            // wired up for a future post-submission review screen — see
            // CLAUDE.md "What's NOT built yet" — even though nothing in the
            // running app sets revealed: true today.
            const status = jumpButtonStatus({
              isAnswered: answers[q.id] !== undefined,
              isCorrect: false,
              revealed: false,
            });
            const isCurrent = index === current;
            // Border color and fill/text color are each set exactly once
            // (never two competing border-color utilities at once), since
            // Tailwind utility precedence depends on generated stylesheet
            // order, not class-list order.
            const fillClasses =
              status === "correct"
                ? "bg-quiz-green-bg text-quiz-green-text"
                : status === "incorrect"
                  ? "bg-quiz-red-bg text-quiz-red-text"
                  : status === "answered"
                    ? "bg-quiz-grey-bg text-quiz-grey-text"
                    : "bg-white text-quiz-grey-text";
            const borderClasses = isCurrent
              ? "border-quiz-navy ring-2 ring-inset ring-quiz-navy-light"
              : status === "correct"
                ? "border-quiz-green-text"
                : status === "incorrect"
                  ? "border-quiz-red-text"
                  : "border-quiz-option-border";
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setCurrent(index)}
                data-testid="jump-btn"
                data-status={status}
                data-current={isCurrent}
                className={`h-[34px] rounded-md border text-[12.5px] font-semibold ${fillClasses} ${borderClasses}`}
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
