import { db, pool } from "./index";
import { masteryScores } from "./schema";
import { recalculateMasteryPairs } from "../lib/quiz";

// One-off (safely re-runnable) fix for mastery_scores rows left stale by
// deleting papers/questions before recalculateMasteryForMcqs existed to keep
// this cache in sync with them (see that function's own comment in
// src/lib/quiz.ts). Recomputes every existing (student, sub-topic) pair from
// scratch against the current quiz_attempt_answers — safe to run any time
// mastery_scores is suspected stale, not just once.
async function main() {
  const rows = await db.select({ studentId: masteryScores.studentId, subTopicId: masteryScores.subTopicId }).from(masteryScores);

  console.log(`Recalculating ${rows.length} mastery_scores row(s)...`);
  await recalculateMasteryPairs(rows);
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
