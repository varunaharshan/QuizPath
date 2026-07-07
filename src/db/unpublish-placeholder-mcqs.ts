import { and, eq, like } from "drizzle-orm";
import { db } from "./index";
import { mcqs } from "./schema";
import { PLACEHOLDER_MARKER } from "./placeholder-check";

// One-off (but safely re-runnable) cleanup: flips every published
// [PLACEHOLDER TEST CONTENT] row to draft, so seeded/placeholder content
// never shows up to students as if it were reviewed material. Unpublishes
// rather than deletes — reversible, and these rows are still useful as
// local dev/test fixtures once flipped back if needed.
async function main() {
  const result = await db
    .update(mcqs)
    .set({ status: "draft" })
    .where(and(eq(mcqs.status, "published"), like(mcqs.questionText, `%${PLACEHOLDER_MARKER}%`)))
    .returning({ id: mcqs.id });

  console.log(`Unpublished ${result.length} placeholder row(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
