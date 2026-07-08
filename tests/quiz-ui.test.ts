import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeQuizProgress, jumpButtonStatus } from "@/lib/quiz-ui";

describe("computeQuizProgress", () => {
  it("reports answered/remaining from counts only, without any notion of correctness", () => {
    expect(computeQuizProgress(40, 0)).toEqual({ answered: 0, remaining: 40 });
    expect(computeQuizProgress(40, 24)).toEqual({ answered: 24, remaining: 16 });
    expect(computeQuizProgress(40, 40)).toEqual({ answered: 40, remaining: 0 });
  });

  it("never goes negative if answeredCount somehow exceeds total", () => {
    expect(computeQuizProgress(3, 5)).toEqual({ answered: 5, remaining: 0 });
  });
});

// Backs the "Question map" jump grid. Pre-submission, the app always calls
// this with revealed: false (see the source guard below) — no feedback is
// ever shown until the student submits and reaches the results page. The
// revealed: true branch exists for when per-question review is eventually
// built (see CLAUDE.md "What's NOT built yet") and is exercised directly
// here so that behavior is covered even though nothing in the running app
// triggers it yet.
describe("jumpButtonStatus", () => {
  it("reports unanswered for an untouched question regardless of revealed", () => {
    expect(jumpButtonStatus({ isAnswered: false, isCorrect: false, revealed: false })).toBe("unanswered");
    expect(jumpButtonStatus({ isAnswered: false, isCorrect: true, revealed: true })).toBe("unanswered");
  });

  it("reports plain 'answered' pre-submission, never correct/incorrect", () => {
    expect(jumpButtonStatus({ isAnswered: true, isCorrect: true, revealed: false })).toBe("answered");
    expect(jumpButtonStatus({ isAnswered: true, isCorrect: false, revealed: false })).toBe("answered");
  });

  it("only splits into correct/incorrect once revealed", () => {
    expect(jumpButtonStatus({ isAnswered: true, isCorrect: true, revealed: true })).toBe("correct");
    expect(jumpButtonStatus({ isAnswered: true, isCorrect: false, revealed: true })).toBe("incorrect");
  });
});

// The quiz-taking UI intentionally drops several behaviors from the mockup
// it borrowed its visuals from (docs/quiz-taking-mockup-reference.html): no
// "Reset test" button, and the live jump grid must never be wired to real
// correctness data. These are guarded here as source
// assertions on the shared QuizForm component, since there's no component
// rendering harness in this project's test setup (all other UI logic in
// this codebase is tested via its underlying pure functions/data, not by
// rendering — see rankRecommendedPracticeTopics in tests/dashboard.test.ts
// for the established pattern this follows).
describe("QuizForm source guards", () => {
  const rawSource = readFileSync(
    path.resolve(__dirname, "../src/components/quiz-form.tsx"),
    "utf-8",
  );
  // Comments legitimately reference the rejected mockup behaviors by name
  // (documenting why they're absent) — strip them so these guards check the
  // actual rendered/executed code, not the explanation of what it avoids.
  const source = rawSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("never renders a Reset/restart affordance", () => {
    expect(source).not.toMatch(/reset/i);
    expect(source).not.toMatch(/restart/i);
  });

  it("renders the hint toggle only when question.hint is present, never an empty placeholder", () => {
    // Gated on question.hint, not unconditionally rendered — a hint-less
    // question must render nothing at all, not an empty box or "no hint"
    // message.
    expect(source).toMatch(/\{question\.hint\s*&&/);
  });

  it("never gates the hint toggle on whether an answer has been selected", () => {
    // The hint must be available before answering, not just after — so the
    // conditional guarding it must reference question.hint, never
    // selectedOption/answers.
    const hintBlockMatch = source.match(/\{question\.hint\s*&&([\s\S]*?)\n\s{8}\)\}/);
    expect(hintBlockMatch).not.toBeNull();
    expect(hintBlockMatch![1]).not.toMatch(/selectedOption/);
  });

  it("always calls jumpButtonStatus with revealed hardcoded to false", () => {
    expect(source).toMatch(/revealed:\s*false/);
  });

  it("renders the per-question sub-topic name as the topic tag", () => {
    expect(source).toMatch(/subTopicName/);
  });

  it("uses only the mockup's exact quiz-* palette tokens, never the app shell's navy/gold/app-* tokens", () => {
    expect(source).toMatch(/quiz-navy|quiz-card-bg|quiz-grey|quiz-purple/);
    expect(source).not.toMatch(/\bnavy-900\b|\bgold-\d|\bapp-border\b|\bapp-surface-muted\b|\bink-secondary\b|\bink\b|\bprogress-bg\b/);
  });
});
