import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { mcqs, modules, subjects, subTopics } from "@/db/schema";
import { findPublishedPlaceholders, PLACEHOLDER_MARKER } from "@/db/placeholder-check";
import { textOptions } from "./helpers";

// Verifies the safeguard behind `npm run db:check-no-published-placeholders`
// actually catches what it claims to — a published row is flagged only when
// it both (a) is published and (b) carries the placeholder marker; a draft
// placeholder or a published non-placeholder row must not be flagged.
describe("findPublishedPlaceholders", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectId: string;
  let publishedPlaceholderId: string;

  beforeAll(async () => {
    const [subject] = await db.insert(subjects).values({ name: `Test Placeholder Guard Subject ${runId}` }).returning();
    subjectId = subject.id;
    const [mod] = await db.insert(modules).values({ subjectId, grade: "10", name: `Mod ${runId}` }).returning();
    const [sub] = await db.insert(subTopics).values({ moduleId: mod.id, name: `Sub ${runId}` }).returning();

    const [publishedPlaceholder] = await db
      .insert(mcqs)
      .values({
        subTopicId: sub.id,
        questionText: `${PLACEHOLDER_MARKER} Guard test row ${runId}`,
        options: textOptions("A", "B"),
        correctOption: 0,
        status: "published",
      })
      .returning();
    publishedPlaceholderId = publishedPlaceholder.id;

    // Should NOT be flagged: draft placeholder.
    await db.insert(mcqs).values({
      subTopicId: sub.id,
      questionText: `${PLACEHOLDER_MARKER} Draft guard test row ${runId}`,
      options: textOptions("A", "B"),
      correctOption: 0,
      status: "draft",
    });

    // Should NOT be flagged: published but not a placeholder.
    await db.insert(mcqs).values({
      subTopicId: sub.id,
      questionText: `Real published question ${runId}`,
      options: textOptions("A", "B"),
      correctOption: 0,
      status: "published",
    });
  });

  afterAll(async () => {
    await db.delete(subjects).where(eq(subjects.id, subjectId));
    await pool.end();
  });

  it("flags only the published row carrying the placeholder marker", async () => {
    const rows = await findPublishedPlaceholders();
    const ours = rows.filter((r) => r.questionText.includes(runId));
    expect(ours.map((r) => r.id)).toEqual([publishedPlaceholderId]);
  });
});
