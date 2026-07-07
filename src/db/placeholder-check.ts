import { and, eq, like } from "drizzle-orm";
import { db } from "./index";
import { mcqs } from "./schema";

export const PLACEHOLDER_MARKER = "[PLACEHOLDER TEST CONTENT]";

// Finds any published mcqs row whose question_text still carries the
// placeholder marker (see src/db/seed.ts's PLACEHOLDER_PREFIX) — used both
// by the standalone CLI check (src/db/check-no-published-placeholders.ts)
// and by tests/placeholder-guard.test.ts, so this safeguard is itself
// verified rather than just asserted in prose.
export async function findPublishedPlaceholders() {
  return db
    .select({ id: mcqs.id, questionText: mcqs.questionText })
    .from(mcqs)
    .where(and(eq(mcqs.status, "published"), like(mcqs.questionText, `%${PLACEHOLDER_MARKER}%`)));
}
