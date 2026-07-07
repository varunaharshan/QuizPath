"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { papers, subjects } from "@/db/schema";
import { requireAdminUser } from "@/lib/current-app-user";
import { isValidGrade, isValidPaperType } from "@/lib/papers";

function isValidStatus(value: FormDataEntryValue | null): value is "draft" | "published" {
  return value === "draft" || value === "published";
}

function parseYear(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const year = Number(value);
  if (!Number.isInteger(year)) throw new Error("Invalid year.");
  return year;
}

// Papers Management's create/edit form doesn't collect medium at all (out
// of scope per the brief) — resolved the same way the rest of the app
// already treats a content subject's medium: pinned to subject.fixedMedium
// when the subject has one, otherwise "english" as the reasonable default
// (mirroring student_profiles.medium's own migration default).
async function resolveMedium(subjectId: string): Promise<"sinhala" | "tamil" | "english"> {
  const subject = await db.query.subjects.findFirst({ where: eq(subjects.id, subjectId) });
  if (!subject) throw new Error("Subject not found.");
  return subject.fixedMedium ?? "english";
}

export async function createPaper(formData: FormData) {
  await requireAdminUser();

  const subjectId = formData.get("subjectId");
  const grade = formData.get("grade");
  const paperType = formData.get("paperType");
  const title = formData.get("title");
  const year = parseYear(formData.get("year"));

  if (typeof subjectId !== "string" || !subjectId) {
    throw new Error("Invalid subject.");
  }
  if (typeof grade !== "string" || !isValidGrade(grade)) {
    throw new Error("Invalid grade.");
  }
  if (typeof paperType !== "string" || !isValidPaperType(paperType)) {
    throw new Error("Invalid paper type.");
  }
  if (typeof title !== "string" || !title.trim()) {
    throw new Error("Paper name is required.");
  }

  const medium = await resolveMedium(subjectId);

  await db.insert(papers).values({
    subjectId,
    grade,
    medium,
    paperType,
    title: title.trim(),
    year,
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

  if (typeof paperId !== "string" || !paperId) {
    throw new Error("Invalid paper.");
  }
  if (typeof subjectId !== "string" || !subjectId) {
    throw new Error("Invalid subject.");
  }
  if (typeof grade !== "string" || !isValidGrade(grade)) {
    throw new Error("Invalid grade.");
  }
  if (typeof paperType !== "string" || !isValidPaperType(paperType)) {
    throw new Error("Invalid paper type.");
  }
  if (typeof title !== "string" || !title.trim()) {
    throw new Error("Paper name is required.");
  }
  if (!isValidStatus(status)) {
    throw new Error("Invalid status.");
  }

  const medium = await resolveMedium(subjectId);

  await db
    .update(papers)
    .set({ subjectId, grade, medium, paperType, title: title.trim(), year, status })
    .where(eq(papers.id, paperId));

  revalidatePath("/admin/papers");
  redirect("/admin/papers");
}

// Same "warn, don't block" reasoning as Topics' deleteModule/deleteSubTopic
// — the warning (question count) is computed server-side (getPapersForAdmin)
// and shown client-side via <ConfirmSubmitButton> before this action ever
// runs. Cascades to mcqs per the existing mcqs.paper_id onDelete: cascade FK.
export async function deletePaper(formData: FormData) {
  await requireAdminUser();

  const paperId = formData.get("paperId");
  if (typeof paperId !== "string" || !paperId) {
    throw new Error("Invalid paper.");
  }

  await db.delete(papers).where(eq(papers.id, paperId));
  revalidatePath("/admin/papers");
}
