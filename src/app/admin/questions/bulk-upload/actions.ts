"use server";

import { inArray, max } from "drizzle-orm";
import { db } from "@/db";
import { mcqs } from "@/db/schema";
import { requireAdminUser } from "@/lib/current-app-user";
import { assignSortOrders, type ResolvedBulkRow } from "@/lib/bulk-upload";

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

  const inserted = await db.transaction(async (tx) => {
    // Each referenced paper's current highest sortOrder, so this import's
    // rows continue after whatever's already there rather than colliding
    // with it (see assignSortOrders' own comment in src/lib/bulk-upload.ts).
    const paperIds = [...new Set(rows.map((row) => row.paperId).filter((id): id is string => id !== null))];
    const maxSortOrderRows = paperIds.length
      ? await tx
          .select({ paperId: mcqs.paperId, maxSortOrder: max(mcqs.sortOrder) })
          .from(mcqs)
          .where(inArray(mcqs.paperId, paperIds))
          .groupBy(mcqs.paperId)
      : [];
    const maxSortOrderByPaperId = new Map(
      maxSortOrderRows.map((r) => [r.paperId as string, Number(r.maxSortOrder ?? -1)]),
    );
    const sortOrders = assignSortOrders(
      rows.map((row) => row.paperId),
      maxSortOrderByPaperId,
    );

    return tx
      .insert(mcqs)
      .values(
        rows.map((row, index) => ({
          subTopicId: row.subTopicId,
          paperId: row.paperId,
          sortOrder: sortOrders[index],
          questionText: row.questionText,
          questionImage: row.questionImage,
          options: row.options,
          correctOption: row.correctOption,
          difficulty: row.difficulty,
          verificationStatus: "unverified" as const,
          keywords: row.keywords,
          hint: row.hint,
        })),
      )
      .returning({ id: mcqs.id });
  });

  return { importedCount: inserted.length };
}
