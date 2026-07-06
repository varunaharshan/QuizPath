// Pure logic backing <KeywordTagInput> (src/components/keyword-tag-input.tsx),
// pulled out and directly unit-tested (tests/keyword-tag-input-logic.test.ts)
// the same way src/lib/quiz-ui.ts backs <QuizForm> — this codebase has no
// component-rendering test harness, so interactive-widget behavior is
// verified as plain functions/data instead of rendered DOM output.

export function normalizeKeyword(text: string): string {
  return text.trim().toLowerCase();
}

const MAX_SUGGESTIONS = 8;

// Substring match (case-insensitive), excluding whatever's already been
// added as a tag (compared normalized, so a differently-cased duplicate of
// an existing tag is still excluded). Ranks prefix matches ("micro..."
// matching "Microorganisms" at position 0) ahead of mid-string matches,
// then alphabetically, for more predictable typeahead behavior — the spec
// only requires substring matching, but prioritizing prefix hits is a
// standard, low-risk autocomplete convention that doesn't contradict it.
export function filterSuggestions(
  allKeywords: string[],
  inputValue: string,
  excludeTags: string[],
  limit = MAX_SUGGESTIONS,
): string[] {
  const query = normalizeKeyword(inputValue);
  if (!query) return [];

  const excluded = new Set(excludeTags.map(normalizeKeyword));
  const matches = allKeywords.filter((kw) => !excluded.has(normalizeKeyword(kw)) && normalizeKeyword(kw).includes(query));

  matches.sort((a, b) => {
    const aStarts = normalizeKeyword(a).startsWith(query) ? 0 : 1;
    const bStarts = normalizeKeyword(b).startsWith(query) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    return a.localeCompare(b);
  });

  return matches.slice(0, limit);
}

export type HighlightSplit = {
  before: string;
  match: string;
  after: string;
};

// Splits `text` around the first case-insensitive occurrence of `query`, so
// the caller can render the matched substring distinctly (e.g. wrapped in a
// <mark>). Returns null when there's nothing to highlight (blank query, or
// no match) — framework-agnostic on purpose, no JSX here, mirroring
// quiz-ui.ts's plain-data style.
export function splitHighlightMatch(text: string, query: string): HighlightSplit | null {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return null;
  const index = text.toLowerCase().indexOf(trimmedQuery.toLowerCase());
  if (index === -1) return null;
  return {
    before: text.slice(0, index),
    match: text.slice(index, index + trimmedQuery.length),
    after: text.slice(index + trimmedQuery.length),
  };
}

// Adds a tag to an existing list, deduplicating case/whitespace-insensitively
// (a differently-cased or padded re-entry of an existing tag is a no-op,
// not a second chip) and trimming the incoming value. Returns the same
// array reference when nothing changes, so callers can skip a re-render.
export function addTag(tags: string[], rawTag: string): string[] {
  const trimmed = rawTag.trim();
  if (!trimmed) return tags;
  if (tags.some((t) => normalizeKeyword(t) === normalizeKeyword(trimmed))) return tags;
  return [...tags, trimmed];
}

// Dedupes an initial tag list (e.g. from repeated ?tags= query params) the
// same way addTag does for a single new entry, keeping the first-seen
// casing of each normalized duplicate.
export function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const key = normalizeKeyword(tag);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}
