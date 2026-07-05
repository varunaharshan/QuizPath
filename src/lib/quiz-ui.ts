// The live stats row shows progress only (how many answered, how many
// left) — never a running correct/wrong/score tally, since that would mean
// revealing correctness before the student submits. Taking only counts as
// input (never per-question correctness) makes that guarantee structural
// rather than just a UI convention to remember.
export function computeQuizProgress(
  totalQuestions: number,
  answeredCount: number,
): { answered: number; remaining: number } {
  return { answered: answeredCount, remaining: Math.max(totalQuestions - answeredCount, 0) };
}

export type JumpButtonStatus = "unanswered" | "answered" | "correct" | "incorrect";

// The jump-grid ("Question map") button coloring must never leak
// correctness before the student submits — the mockup this UI's visuals
// were adapted from colors each button green/red live as the student
// answers, which is explicitly rejected (see CLAUDE.md "Quiz-taking flow":
// no feedback until results). `revealed` is always false everywhere this is
// called today, since per-question review after a quiz isn't built yet (see
// CLAUDE.md "What's NOT built yet") — this function is ready for that screen
// without needing a signature change once it exists.
export function jumpButtonStatus(params: {
  isAnswered: boolean;
  isCorrect: boolean;
  revealed: boolean;
}): JumpButtonStatus {
  const { isAnswered, isCorrect, revealed } = params;
  if (!isAnswered) return "unanswered";
  if (!revealed) return "answered";
  return isCorrect ? "correct" : "incorrect";
}
