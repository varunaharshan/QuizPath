import { describe, expect, it } from "vitest";
import {
  addTag,
  dedupeTags,
  filterSuggestions,
  normalizeKeyword,
  splitHighlightMatch,
} from "@/lib/keyword-tag-input-logic";

describe("filterSuggestions", () => {
  const allKeywords = ["Microorganisms", "Microfiber", "Microcontroller", "Photosynthesis", "Catalyst"];

  it("matches any substring, case-insensitive", () => {
    const result = filterSuggestions(allKeywords, "MICRO", []);
    expect(result).toEqual(["Microcontroller", "Microfiber", "Microorganisms"]);
  });

  it("returns nothing for a blank query", () => {
    expect(filterSuggestions(allKeywords, "   ", [])).toEqual([]);
  });

  it("excludes keywords already added as tags, case/whitespace-insensitively", () => {
    const result = filterSuggestions(allKeywords, "micro", [" microorganisms "]);
    expect(result).not.toContain("Microorganisms");
    expect(result).toContain("Microfiber");
    expect(result).toContain("Microcontroller");
  });

  it("ranks prefix matches ahead of mid-string matches", () => {
    const result = filterSuggestions(["Photosynthesis", "Endophotosynthesis-like"], "photo", []);
    expect(result[0]).toBe("Photosynthesis");
  });

  it("respects the limit parameter", () => {
    const result = filterSuggestions(allKeywords, "i", [], 2);
    expect(result).toHaveLength(2);
  });
});

describe("splitHighlightMatch", () => {
  it("splits text around the first case-insensitive match", () => {
    expect(splitHighlightMatch("Microorganisms", "micro")).toEqual({
      before: "",
      match: "Micro",
      after: "organisms",
    });
  });

  it("returns null when the query doesn't appear in the text", () => {
    expect(splitHighlightMatch("Photosynthesis", "xyz")).toBeNull();
  });

  it("returns null for a blank query", () => {
    expect(splitHighlightMatch("Photosynthesis", "   ")).toBeNull();
  });
});

describe("addTag", () => {
  it("adds a trimmed tag to the list", () => {
    expect(addTag(["A"], "  B  ")).toEqual(["A", "B"]);
  });

  it("does not add a duplicate, case/whitespace-insensitively", () => {
    const tags = ["Frequency"];
    expect(addTag(tags, "frequency")).toBe(tags); // same reference: no-op
    expect(addTag(tags, "  FREQUENCY  ")).toEqual(["Frequency"]);
  });

  it("ignores a blank tag", () => {
    const tags = ["A"];
    expect(addTag(tags, "   ")).toBe(tags);
  });
});

describe("dedupeTags", () => {
  it("keeps the first-seen casing and drops later case-insensitive duplicates", () => {
    expect(dedupeTags(["Frequency", "frequency", "FREQUENCY", "Catalyst"])).toEqual(["Frequency", "Catalyst"]);
  });

  it("drops blank entries", () => {
    expect(dedupeTags(["A", "  ", ""])).toEqual(["A"]);
  });
});

describe("normalizeKeyword", () => {
  it("trims and lowercases", () => {
    expect(normalizeKeyword("  Frequency  ")).toBe("frequency");
  });
});
