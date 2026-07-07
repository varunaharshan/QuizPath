"use server";

import { db } from "@/db";
import { mcqs } from "@/db/schema";
import { requireAdminUser } from "@/lib/current-app-user";
import type { ResolvedBulkRow } from "@/lib/bulk-upload";

// Called directly from <BulkUploadForm> (a Client Component) with the
// already-validated, already-resolved rows — the same "Client Component
// calls a bound Server Action directly, not through a <form>" shape
// QuizForm's per-answer auto-save already established, since there's no
// FormData shape that fits "an array of rows" naturally.
//
// All-or-nothing at the DB level too, not just the UI gate that disables
// Confirm Import while any row has errors: everything is inserted inside
// one transaction, so a failure partway through (e.g. a stale reference —
// the reference data was fetched once at page load and could theoretically
// go stale if another admin deletes a topic mid-review) rolls back the
// whole batch rather than leaving a partial import.
export async function bulkImportQuestions(rows: ResolvedBulkRow[]): Promise<{ importedCount: number }> {
  await requireAdminUser();

  if (rows.length === 0) {
    throw new Error("No rows to import.");
  }

  const inserted = await db.transaction(async (tx) =>
    tx
      .insert(mcqs)
      .values(
        rows.map((row) => ({
          subTopicId: row.subTopicId,
          paperId: row.paperId,
          questionText: row.questionText,
          options: row.options,
          correctOption: row.correctOption,
          difficulty: row.difficulty,
          verificationStatus: "unverified" as const,
          keywords: row.keywords,
        })),
      )
      .returning({ id: mcqs.id }),
  );

  return { importedCount: inserted.length };
}
