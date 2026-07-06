import { and, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { mcqs, modules, subTopics } from "@/db/schema";
import type { SubTopicStatus } from "./dashboard";

// Weak Areas lists topics the student has actually attempted and scored
// below the "needs work" threshold — not_started topics aren't included
// (no evidence they're specifically weak, just untried; see
// rankRecommendedPracticeTopics in dashboard.ts for the same reasoning),
// and mastered/in_progress topics don't need remedial practice. Sorted by
// score ascending — lowest (most urgent) first.
export function weakAreas(topics: SubTopicStatus[]): SubTopicStatus[] {
  return topics
    .filter((t) => t.label === "needs_work")
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
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
// names, and published question text — rather than a dedicated keyword
// taxonomy, since no keywords table/column exists in the schema. Returns
// the set of matching sub-topic IDs; callers filter their own
// already-fetched SubTopicStatus[] down to this set rather than this
// function returning statuses itself, so there's only one place
// (getSubTopicStatusesForGrade) that computes mastery.
export async function searchSubTopicIdsByKeyword(
  grade: "10" | "11",
  query: string,
): Promise<Set<string>> {
  const trimmed = query.trim();
  if (!trimmed) return new Set();
  const pattern = `%${trimmed}%`;

  const rows = await db
    .selectDistinct({ id: subTopics.id })
    .from(subTopics)
    .innerJoin(modules, eq(modules.id, subTopics.moduleId))
    .leftJoin(mcqs, and(eq(mcqs.subTopicId, subTopics.id), eq(mcqs.status, "published")))
    .where(
      and(
        eq(modules.grade, grade),
        or(ilike(subTopics.name, pattern), ilike(modules.name, pattern), ilike(mcqs.questionText, pattern)),
      ),
    );

  return new Set(rows.map((r) => r.id));
}
