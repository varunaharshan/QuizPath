// Explicit locale, not `undefined` — `toLocaleDateString(undefined, ...)`
// resolves to whatever locale the running environment defaults to, which
// differs between the server (SSR) and the browser (hydration), causing a
// hydration mismatch the instant those two disagree (e.g. "Jul 9" vs
// "9 Jul"). Fixing the locale makes the output deterministic everywhere
// this runs, matching this codebase's existing "extract pure, testable
// display logic" convention (masteryLabelForScore, computeQuizProgress,
// etc.) rather than leaving formatting inline in a component.
export function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
