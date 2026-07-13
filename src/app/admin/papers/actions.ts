"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { mcqs, papers } from "@/db/schema";
import { requireAdminUser } from "@/lib/current-app-user";
import { getMasteryPairsForMcqs, recalculateMasteryPairs } from "@/lib/quiz";
import { getGrades, getPaperTypes, isValidGrade, isValidMedium, isValidPaperType } from "@/lib/reference-data";

function isValidStatus(value: FormDataEntryValue | null): value is "draft" | "published" {
  return value === "draft" || value === "published";
}

function parseYear(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const year = Number(value);
  if (!Number.isInteger(year)) throw new Error("Invalid year.");
  return year;
}

function parseTimeLimitMinutes(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw new Error("Time limit must be a positive whole number of minutes.");
  }
  return minutes;
}

// Medium is just another field on the paper itself now — a subject carries
// no medium of its own to fall back on or be overridden by (see CLAUDE.md
// "Medium and papers"), so this is a flat validation, not a subject lookup.
function resolveMedium(submittedMedium: FormDataEntryValue | null): "sinhala" | "tamil" | "english" {
  if (!isValidMedium(submittedMedium)) throw new Error("Invalid medium.");
  return submittedMedium;
}

export async function createPaper(formData: FormData) {
  await requireAdminUser();

  const subjectId = formData.get("subjectId");
  const grade = formData.get("grade");
  const paperType = formData.get("paperType");
  const title = formData.get("title");
  const year = parseYear(formData.get("year"));
  const timeLimitMinutes = parseTimeLimitMinutes(formData.get("timeLimitMinutes"));

  if (typeof subjectId !== "string" || !subjectId) {
    throw new Error("Invalid subject.");
  }
  if (typeof grade !== "string" || !isValidGrade(grade, await getGrades())) {
    throw new Error("Invalid grade.");
  }
  if (typeof paperType !== "string" || !isValidPaperType(paperType, await getPaperTypes())) {
    throw new Error("Invalid paper type.");
  }
  if (typeof title !== "string" || !title.trim()) {
    throw new Error("Paper name is required.");
  }

  const medium = resolveMedium(formData.get("medium"));

  await db.insert(papers).values({
    subjectId,
    grade,
    medium,
    paperType,
    title: title.trim(),
    year,
    timeLimitMinutes,
  });

  revalidatePath("/admin/papers");
  redirect("/admin/papers");
}

export async function updatePaper(formData: FormData) {
  await requireAdminUser();

  const paperId = formData.get("paperId");
  const subjectId = formData.get("subjectId");
  const grade = formData.get("grade");
  const paperType = formData.get("paperType");
  const title = formData.get("title");
  const status = formData.get("status");
  const year = parseYear(formData.get("year"));
  const timeLimitMinutes = parseTimeLimitMinutes(formData.get("timeLimitMinutes"));

  if (typeof paperId !== "string" || !paperId) {
    throw new Error("Invalid paper.");
  }
  if (typeof subjectId !== "string" || !subjectId) {
    throw new Error("Invalid subject.");
  }
  if (typeof grade !== "string" || !isValidGrade(grade, await getGrades())) {
    throw new Error("Invalid grade.");
  }
  if (typeof paperType !== "string" || !isValidPaperType(paperType, await getPaperTypes())) {
    throw new Error("Invalid paper type.");
  }
  if (typeof title !== "string" || !title.trim()) {
    throw new Error("Paper name is required.");
  }
  if (!isValidStatus(status)) {
    throw new Error("Invalid status.");
  }

  const medium = resolveMedium(formData.get("medium"));

  await db
    .update(papers)
    .set({ subjectId, grade, medium, paperType, title: title.trim(), year, status, timeLimitMinutes })
    .where(eq(papers.id, paperId));

  revalidatePath("/admin/papers");
  redirect("/admin/papers");
}

// Same "warn, don't block" reasoning as Topics' deleteModule/deleteSubTopic
// — the warning (question count) is computed server-side (getPapersForAdmin)
// and shown client-side via <ConfirmSubmitButton> before this action ever
// runs. Cascades to mcqs per the existing mcqs.paper_id onDelete: cascade FK,
// which in turn cascades to quiz_attempt_answers — but mastery_scores is a
// cache, not something a cascade touches, so any sub-topic a deleted
// question was tagged with needs an explicit recalculation or its cached
// score/questionsAnswered keeps referencing answers that no longer exist
// (see recalculateMasteryForMcqs's own comment in src/lib/quiz.ts for why
// this has to happen in two steps around the delete).
export async function deletePaper(formData: FormData) {
  await requireAdminUser();

  const paperId = formData.get("paperId");
  if (typeof paperId !== "string" || !paperId) {
    throw new Error("Invalid paper.");
  }

  const paperMcqs = await db.select({ id: mcqs.id }).from(mcqs).where(eq(mcqs.paperId, paperId));
  const affectedPairs = await getMasteryPairsForMcqs(paperMcqs.map((m) => m.id));

  await db.delete(papers).where(eq(papers.id, paperId));
  await recalculateMasteryPairs(affectedPairs);

  revalidatePath("/admin/papers");
}
