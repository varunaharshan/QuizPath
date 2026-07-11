import { eq } from "drizzle-orm";
import { db, pool } from "./index";
import { mcqs, papers } from "./schema";

// One-off (but safely re-runnable) backfill for the newly-introduced
// mcqs.sortOrder — see schema.ts's own comment on that column for the bug
// this fixes (ordering a paper's questions by createdAt alone is
// unreliable, since Bulk Upload inserts a whole paper's questions in one
// statement and Postgres evaluates defaultNow() once per statement, giving
// every row in that batch an identical createdAt).
//
// For each paper, orders its existing questions by (created_at, ctid) —
// ctid (a row's current physical location) is the best available proxy
// for original insertion order for any question that hasn't been UPDATEd
// since it was imported, since an UPDATE relocates a row's ctid under
// Postgres's MVCC. This is a best-effort recovery, not a guarantee: for a
// paper where a question was already verified or published before this
// backfill runs, that question's ctid no longer reflects its true original
// position, and this can't recover it — there's no reorder UI yet to fix
// that by hand, so any such paper is worth a manual spot-check afterward.
//
// Always recomputes every paper from scratch (no "skip if already set"
// check) — there's no admin UI to manually reorder questions that a re-run
// could clobber, the same reasoning backfill-keywords.ts already documents
// for itself.
async function main() {
  const paperRows = await db.select({ id: papers.id }).from(papers);

  let papersWithQuestions = 0;
  let questionsUpdated = 0;

  for (const paper of paperRows) {
    const { rows } = await pool.query<{ id: string }>(
      "SELECT id FROM mcqs WHERE paper_id = $1 ORDER BY created_at, ctid",
      [paper.id],
    );
    if (rows.length === 0) continue;

    for (let i = 0; i < rows.length; i++) {
      await db.update(mcqs).set({ sortOrder: i }).where(eq(mcqs.id, rows[i].id));
    }
    papersWithQuestions++;
    questionsUpdated += rows.length;
  }

  console.log("Question sortOrder backfill complete.");
  console.log(`  Papers checked:              ${paperRows.length}`);
  console.log(`  Papers with questions found: ${papersWithQuestions}`);
  console.log(`  Questions given a sortOrder: ${questionsUpdated}`);
  console.log(
    "\nNote: this recovers each paper's original question order on a best-effort basis via " +
      "(created_at, ctid). Any question already verified or published before this backfill ran " +
      "may not have its true original position recovered, since updating a row moves its ctid — " +
      "spot-check papers you know were already reviewed before this fix shipped.",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
