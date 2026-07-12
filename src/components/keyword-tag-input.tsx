"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { addTag, dedupeTags, filterSuggestions, splitHighlightMatch } from "@/lib/keyword-tag-input-logic";

// Module-level, short-lived cache for the full distinct-keyword list —
// shared across mounts of this component within the same client session
// (e.g. navigating away from and back to the search page), so re-mounting
// doesn't refetch every time. See src/lib/practice.ts getKeywordSuggestions
// for why a full-list client-side load is the right call at today's scale
// (low hundreds of distinct keywords) rather than a per-keystroke search
// endpoint.
const CACHE_TTL_MS = 5 * 60 * 1000;
const keywordCache = new Map<string, { data: string[]; fetchedAt: number }>();

async function fetchKeywords(grade: string): Promise<string[]> {
  const cached = keywordCache.get(grade);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }
  const res = await fetch(`/api/keywords?grade=${grade}`);
  if (!res.ok) return cached?.data ?? [];
  const json: { keywords?: string[] } = await res.json();
  const data = json.keywords ?? [];
  keywordCache.set(grade, { data, fetchedAt: Date.now() });
  return data;
}

function renderHighlighted(text: string, query: string) {
  const split = splitHighlightMatch(text, query);
  if (!split) return text;
  return (
    <>
      {split.before}
      <mark className="rounded-sm bg-progress-bg font-semibold text-progress">{split.match}</mark>
      {split.after}
    </>
  );
}

// A multi-tag keyword combobox: type to see matching existing keywords
// (loaded once client-side, filtered locally as you type — see
// fetchKeywords above and filterSuggestions in keyword-tag-input-logic.ts),
// pick one to add it as a chip and keep typing the next, or just type free
// text and press Enter/Search (kept as a fallback alongside the tag-based
// search, so this doesn't hard-lock searches to a known vocabulary).
// Renders the whole search <form> itself (not just the input) so a hidden
// input mirroring the live, not-yet-committed input text can ride along
// with each committed chip's own hidden input — that's what lets an
// in-progress, un-Entered term still submit via the Search button with zero
// extra onSubmit wiring.
export function KeywordTagInput({
  initialTags,
  grade,
  placeholder = "Search e.g. Photosynthesis, Ohm's Law…",
  fieldName = "tags",
}: {
  initialTags: string[];
  grade: string;
  placeholder?: string;
  fieldName?: string;
}) {
  const [tags, setTags] = useState<string[]>(() => dedupeTags(initialTags));
  const [allKeywords, setAllKeywords] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const listboxId = useId();

  useEffect(() => {
    let cancelled = false;
    fetchKeywords(grade).then((data) => {
      if (!cancelled) setAllKeywords(data);
    });
    return () => {
      cancelled = true;
    };
  }, [grade]);

  const suggestions = useMemo(
    () => filterSuggestions(allKeywords, inputValue, tags),
    [inputValue, allKeywords, tags],
  );

  const clampedHighlighted = highlightedIndex >= suggestions.length ? -1 : highlightedIndex;
  const showDropdown = open && suggestions.length > 0;

  function commitTag(rawTag: string) {
    setTags((prev) => addTag(prev, rawTag));
    setInputValue("");
    setOpen(false);
    setHighlightedIndex(-1);
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      if (suggestions.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlightedIndex((prev) => {
        const base = prev >= suggestions.length ? -1 : prev;
        return (base + 1 + suggestions.length) % suggestions.length;
      });
    } else if (e.key === "ArrowUp") {
      if (suggestions.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlightedIndex((prev) => {
        const base = prev >= suggestions.length ? -1 : prev;
        return (base - 1 + suggestions.length) % suggestions.length;
      });
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    } else if (e.key === "Enter") {
      if (open && clampedHighlighted >= 0 && suggestions[clampedHighlighted]) {
        e.preventDefault();
        commitTag(suggestions[clampedHighlighted]);
      } else if (inputValue.trim()) {
        e.preventDefault();
        commitTag(inputValue);
      }
      // Otherwise: input is empty and nothing is highlighted — let the
      // native form submission proceed (Search).
    }
  }

  return (
    <form className="mb-4.5 flex max-w-[640px] flex-wrap items-start gap-2.5">
      <div className="relative min-w-[240px] flex-1">
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-app-border bg-white px-2 py-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-progress-bg px-2.5 py-1 text-[12.5px] font-medium text-progress"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={`Remove ${tag}`}
                className="text-progress/70 hover:text-progress"
              >
                ×
              </button>
              <input type="hidden" name={fieldName} value={tag} />
            </span>
          ))}
          <input
            type="text"
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              showDropdown && clampedHighlighted >= 0 ? `${listboxId}-option-${clampedHighlighted}` : undefined
            }
            autoComplete="off"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setOpen(true);
              setHighlightedIndex(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
            placeholder={tags.length === 0 ? placeholder : "Add another…"}
            className="min-w-[140px] flex-1 border-none bg-transparent px-1 py-0.5 text-[13.5px] text-ink outline-none"
          />
          {/* Mirrors the live, not-yet-committed input so it still submits
              as one more search term if the student clicks Search without
              pressing Enter first. */}
          <input type="hidden" name={fieldName} value={inputValue.trim()} />
        </div>

        {showDropdown && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-auto rounded-md border border-app-border bg-white shadow-md"
          >
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={index === clampedHighlighted}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commitTag(suggestion)}
                className={`cursor-pointer px-3 py-2 text-[13px] ${
                  index === clampedHighlighted ? "bg-progress-bg text-progress" : "text-ink hover:bg-app-surface-muted"
                }`}
              >
                {renderHighlighted(suggestion, inputValue)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="submit"
        className="shrink-0 rounded-md bg-navy-900 px-4.5 py-2 text-[13px] font-semibold text-white hover:bg-navy-800"
      >
        Search
      </button>
    </form>
  );
}
