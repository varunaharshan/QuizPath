import { eq } from "drizzle-orm";
import { db } from "./index";
import { mcqs, subTopics } from "./schema";
import { extractKeywords } from "../lib/keyword-extraction";

// One-off (but safely re-runnable) backfill for mcqs.keywords — see
// CLAUDE.md "Practice by Keyword" for why this is plain tags on the
// question row rather than a separate keyword-to-topic table. Always
// recomputes every row from scratch (no "skip if already tagged" check):
// extractKeywords is deterministic, and there's no admin UI yet to hand-edit
// keywords that a re-run could clobber (see "What's NOT built yet").
async function main() {
  const rows = await db
    .select({
      id: mcqs.id,
      questionText: mcqs.questionText,
      options: mcqs.options,
      correctOption: mcqs.correctOption,
      subTopicName: subTopics.name,
    })
    .from(mcqs)
    .leftJoin(subTopics, eq(subTopics.id, mcqs.subTopicId));

  let updated = 0;
  const needsReview: { id: string; questionText: string; subTopicName: string | null }[] = [];

  for (const row of rows) {
    const correctOption = row.options[row.correctOption];
    // Only text options have anything to derive a keyword from — an
    // image-based correct answer has no text content to extract.
    const correctAnswerText = correctOption?.type === "text" ? correctOption.content : null;
    const keywords = extractKeywords({
      questionText: row.questionText,
      correctAnswerText,
      subTopicName: row.subTopicName,
    });

    await db.update(mcqs).set({ keywords }).where(eq(mcqs.id, row.id));

    if (keywords.length === 0) {
      needsReview.push({ id: row.id, questionText: row.questionText, subTopicName: row.subTopicName });
    } else {
      updated++;
    }
  }

  console.log("Keyword backfill complete.");
  console.log(`  Total questions processed: ${rows.length}`);
  console.log(`  Updated with keywords:     ${updated}`);
  console.log(`  Left with no keywords:     ${needsReview.length}`);

  if (needsReview.length > 0) {
    console.log("\nQuestions needing manual review (no keywords could be derived):");
    for (const q of needsReview) {
      console.log(`  - [${q.id}] "${q.questionText}" (${q.subTopicName ?? "no sub-topic"})`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
