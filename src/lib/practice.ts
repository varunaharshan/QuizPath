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
