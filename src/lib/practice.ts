import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { mcqs, modules, subTopics } from "@/db/schema";
import { moduleGradesForQuery } from "@/lib/reference-data";
import type { SubTopicStatus, TopicStatus } from "./dashboard";

// Weak Areas lists topics the student has actually attempted and scored
// below the "needs work" threshold — not_started topics aren't included
// (no evidence they're specifically weak, just untried), and
// mastered/in_progress topics don't need remedial practice. Sorted by
// score ascending — lowest (most urgent) first.
export function weakAreas(topics: SubTopicStatus[]): SubTopicStatus[] {
  return topics
    .filter((t) => t.label === "needs_work")
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
}

export type SubjectTopicGroup = {
  subjectId: string;
  subjectName: string;
  topics: SubTopicStatus[];
};

// Groups every sub-topic for a grade by subject for Practice by Topic's
// subject-tab card grid — unlike groupWeakAreasBySubject, this keeps every
// topic (not just needs_work ones) and doesn't slice or average anything,
// since the whole point of By Topic is browsing everything, filtered by
// subject rather than by weakness. Order within each group is preserved
// exactly as passed in (getSubTopicStatusesForGrade's existing syllabus
// order: module sortOrder, then sub-topic sortOrder), so cards still read
// top-to-bottom in unit order once grouped. Groups themselves are sorted by
// subject name, giving a stable, deterministic tab order.
export function groupTopicsBySubject(topics: SubTopicStatus[]): SubjectTopicGroup[] {
  const bySubject = new Map<string, { subjectName: string; topics: SubTopicStatus[] }>();
  for (const topic of topics) {
    const group = bySubject.get(topic.subjectId);
    if (group) {
      group.topics.push(topic);
    } else {
      bySubject.set(topic.subjectId, { subjectName: topic.subjectName, topics: [topic] });
    }
  }

  return [...bySubject.entries()]
    .map(([subjectId, { subjectName, topics: subjectTopics }]) => ({ subjectId, subjectName, topics: subjectTopics }))
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName));
}

export type TopicStatusSubjectGroup = {
  subjectId: string;
  subjectName: string;
  topics: TopicStatus[];
};

// Topic (module)-level analog of groupTopicsBySubject, for the Dashboard's
// "Topic Performance" card now that its rows are Topics rather than
// sub-topics (see getTopicStatusesForGrade). Same bucket-by-subject,
// sort-groups-by-subject-name shape — kept as its own function rather than
// generalizing groupTopicsBySubject to accept either shape, since
// SubTopicStatus and TopicStatus aren't interchangeable beyond both
// carrying subjectId/subjectName.
export function groupTopicStatusesBySubject(topics: TopicStatus[]): TopicStatusSubjectGroup[] {
  const bySubject = new Map<string, { subjectName: string; topics: TopicStatus[] }>();
  for (const topic of topics) {
    const group = bySubject.get(topic.subjectId);
    if (group) {
      group.topics.push(topic);
    } else {
      bySubject.set(topic.subjectId, { subjectName: topic.subjectName, topics: [topic] });
    }
  }

  return [...bySubject.entries()]
    .map(([subjectId, { subjectName, topics: subjectTopics }]) => ({ subjectId, subjectName, topics: subjectTopics }))
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName));
}

export type WeakAreaSubjectGroup = {
  subjectId: string;
  subjectName: string;
  // Average score across every needs_work topic in this subject (not just
  // the ones actually shown in `topics` below) — the tile header's "58%" in
  // the reference mockup is a per-subject rollup, not a stat for the
  // truncated preview list.
  accuracy: number;
  // Already sorted lowest-score-first by weakAreas(); sliced to `limit` for
  // the tile preview. `totalCount` (below) is the true count so "View All"
  // knows there's more even when the preview is truncated.
  topics: SubTopicStatus[];
  totalCount: number;
};

// Takes weakAreas()'s flat, already-sorted output and buckets it by subject
// for the Weak Areas page's subject-tile grid — grouping is purely a
// presentation concern layered on top of the existing filter/sort logic,
// which stays untouched. Groups are sorted by accuracy ascending (weakest
// subject first, mirroring weakAreas()'s own "most urgent first" ordering);
// a subject with zero needs_work topics simply never appears, so the grid
// only ever renders tiles with real data.
export function groupWeakAreasBySubject(topics: SubTopicStatus[], limit = 3): WeakAreaSubjectGroup[] {
  const bySubject = new Map<string, { subjectName: string; topics: SubTopicStatus[] }>();
  for (const topic of topics) {
    const group = bySubject.get(topic.subjectId);
    if (group) {
      group.topics.push(topic);
    } else {
      bySubject.set(topic.subjectId, { subjectName: topic.subjectName, topics: [topic] });
    }
  }

  const groups: WeakAreaSubjectGroup[] = [...bySubject.entries()].map(([subjectId, { subjectName, topics: subjectTopics }]) => {
    const accuracy =
      Math.round((subjectTopics.reduce((sum, t) => sum + (t.score ?? 0), 0) / subjectTopics.length) * 100) / 100;
    return {
      subjectId,
      subjectName,
      accuracy,
      topics: subjectTopics.slice(0, limit),
      totalCount: subjectTopics.length,
    };
  });

  return groups.sort((a, b) => a.accuracy - b.accuracy);
}

// By Keyword searches existing content directly — sub-topic names, module
// names, published question text, and (since the keywords backfill) each
// published question's own keywords tags — rather than a dedicated keyword
// taxonomy table, since no keyword-to-topic mapping exists in the schema by
// design (see CLAUDE.md "Practice by Keyword": a keyword's topic association
// is purely implicit, from whichever question(s) happen to carry that tag).
// Matching is done in JS over one broad, grade-scoped fetch rather than SQL
// ilike, since a tag search needs to check each element of the keywords
// array anyway — this keeps all four match conditions (name/module
// name/question text/keyword tag) in one readable place instead of splitting
// the keyword-array check into a separate raw-SQL fragment. Returns the set
// of matching sub-topic IDs; callers filter their own already-fetched
// SubTopicStatus[] down to this set rather than this function returning
// statuses itself, so there's only one place (getSubTopicStatusesForGrade)
// that computes mastery. `grade` may be "gcse" — moduleGradesForQuery
// expands it to Grade 10 + Grade 11's own modules (there's no GCSE-owned
// taxonomy); searchSubTopicIdsByKeywords/getTopKeywords/getKeywordSuggestions
// all inherit this for free since they delegate to this function (or share
// its tallyKeywordsForGrade helper below).
export async function searchSubTopicIdsByKeyword(
  grade: string,
  query: string,
): Promise<Set<string>> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return new Set();

  const rows = await db
    .select({
      id: subTopics.id,
      subTopicName: subTopics.name,
      moduleName: modules.name,
      questionText: mcqs.questionText,
      keywords: mcqs.keywords,
    })
    .from(subTopics)
    .innerJoin(modules, eq(modules.id, subTopics.moduleId))
    .leftJoin(mcqs, and(eq(mcqs.subTopicId, subTopics.id), eq(mcqs.status, "published")))
    .where(inArray(modules.grade, moduleGradesForQuery(grade)));

  const matches = new Set<string>();
  for (const row of rows) {
    const nameMatch =
      row.subTopicName.toLowerCase().includes(trimmed) || row.moduleName.toLowerCase().includes(trimmed);
    const textMatch = row.questionText?.toLowerCase().includes(trimmed) ?? false;
    const keywordMatch = row.keywords?.some((k) => k.toLowerCase().includes(trimmed)) ?? false;
    if (nameMatch || textMatch || keywordMatch) matches.add(row.id);
  }
  return matches;
}

// Multi-tag version of searchSubTopicIdsByKeyword — ORs the matches across
// every provided term (the keyword-tag autocomplete's already-committed
// chips, plus whatever's still typed but not yet committed) rather than
// requiring one combined string. A topic needs only one of the terms to
// match, mirroring a typical multi-select filter rather than requiring
// every term to be satisfied at once. Reuses the existing single-term
// function as-is rather than duplicating its matching logic.
export async function searchSubTopicIdsByKeywords(grade: string, queries: string[]): Promise<Set<string>> {
  const results = await Promise.all(queries.map((query) => searchSubTopicIdsByKeyword(grade, query)));
  const union = new Set<string>();
  for (const result of results) {
    for (const id of result) union.add(id);
  }
  return union;
}

export type TopKeyword = {
  keyword: string;
  count: number;
};

// Shared by getTopKeywords and getKeywordSuggestions below — both need the
// same raw per-keyword frequency count for a grade, just presented
// differently (top-N by popularity vs. a full, near-duplicate-merged list
// for autocomplete).
async function tallyKeywordsForGrade(grade: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ keywords: mcqs.keywords })
    .from(mcqs)
    .innerJoin(subTopics, eq(subTopics.id, mcqs.subTopicId))
    .innerJoin(modules, eq(modules.id, subTopics.moduleId))
    .where(and(inArray(modules.grade, moduleGradesForQuery(grade)), eq(mcqs.status, "published")));

  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const keyword of row.keywords) {
      counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
    }
  }
  return counts;
}

// Powers By Keyword's default "Top Keywords" section (shown before the
// student types anything) — real frequency across this grade's published
// question bank, not placeholder data. Scoped to the grade (unlike a global
// count) so every pill is guaranteed to produce at least one result when
// clicked: a keyword only tagged on a different grade's questions would
// otherwise show up but search to empty. Ties broken alphabetically for a
// stable, deterministic order.
export async function getTopKeywords(grade: string, limit = 10): Promise<TopKeyword[]> {
  const counts = await tallyKeywordsForGrade(grade);
  return [...counts.entries()]
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword))
    .slice(0, limit);
}

// Backs the keyword-tag autocomplete input (src/components/keyword-tag-input.tsx)
// — the full distinct-keyword list for a grade, small enough (low hundreds
// today) to load client-side once rather than hitting a search endpoint per
// keystroke. Near-duplicate casings (e.g. "Frequency" / "frequency") are
// merged into a single suggestion — summed count, and the most-frequent
// casing wins as the display form — so the dropdown doesn't silently list
// them as unrelated entries. This is a presentation-layer fix only: the
// underlying mcqs.keywords rows still carry whatever casing was written,
// which stays a known data-quality issue worth a cleanup pass later (see
// CLAUDE.md "Question keyword tagging"). Sorted alphabetically rather than
// by frequency (unlike getTopKeywords) so near-duplicate spellings that
// aren't exact case-insensitive matches (e.g. a plural variant) still land
// next to each other for a human scanning the list, without attempting
// risky stemming/pluralization logic.
export async function getKeywordSuggestions(grade: string): Promise<string[]> {
  const counts = await tallyKeywordsForGrade(grade);

  const byNormalized = new Map<string, { display: string; displayCount: number }>();
  for (const [keyword, count] of counts) {
    const normalized = keyword.trim().toLowerCase();
    const existing = byNormalized.get(normalized);
    if (!existing || count > existing.displayCount) {
      byNormalized.set(normalized, { display: keyword, displayCount: count });
    }
  }

  return [...byNormalized.values()].map(({ display }) => display).sort((a, b) => a.localeCompare(b));
}
