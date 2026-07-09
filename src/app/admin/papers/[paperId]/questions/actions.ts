"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { mcqs, subTopics } from "@/db/schema";
import { requireAdminUser } from "@/lib/current-app-user";
import { isWellFormedUrl, parseCorrectAnswerPosition, resolveOption } from "@/lib/bulk-upload";

// Same "warn, don't block" reasoning as Topics/Papers delete — the warning
// itself is a client-side window.confirm() via <ConfirmSubmitButton>, not a
// server-side re-check. Cascades nothing further (mcqs is a leaf table).
export async function deleteQuestion(formData: FormData) {
  await requireAdminUser();

  const mcqId = formData.get("mcqId");
  const paperId = formData.get("paperId");
  if (typeof mcqId !== "string" || !mcqId) {
    throw new Error("Invalid question.");
  }
  if (typeof paperId !== "string" || !paperId) {
    throw new Error("Invalid paper.");
  }

  await db.delete(mcqs).where(eq(mcqs.id, mcqId));
  revalidatePath(`/admin/papers/${paperId}/questions`);
}

// A single-field flip (like Topics' reorder buttons), bound via .bind() on
// each button's formAction rather than a name/value pair — see CLAUDE.md
// "Topics management" for why pairing a manual name with a function
// formAction causes a hydration mismatch.
export async function setVerificationStatus(
  mcqId: string,
  status: "verified" | "unverified",
  paperId: string,
) {
  await requireAdminUser();

  await db.update(mcqs).set({ verificationStatus: status }).where(eq(mcqs.id, mcqId));
  revalidatePath(`/admin/papers/${paperId}/questions`);
}

// A question's own draft/published status — independent of the paper's own
// status and of verificationStatus (see AdminPaperQuestion's comment in
// src/lib/admin-questions.ts). Bulk Upload always imports as "draft" and
// nothing else in this app ever flips it, so this (plus publishAllQuestions
// below) is the only way a question actually becomes servable to students.
export async function setQuestionStatus(
  mcqId: string,
  status: "draft" | "published",
  paperId: string,
) {
  await requireAdminUser();

  await db.update(mcqs).set({ status }).where(eq(mcqs.id, mcqId));
  revalidatePath(`/admin/papers/${paperId}/questions`);
}

// Bulk "go live" action for the whole paper — flips every one of its
// questions to published in one go, since toggling potentially dozens of
// rows individually after a Bulk Upload import would be impractical. Gated
// behind a client-side window.confirm() (<ConfirmSubmitButton>) on the page
// since it makes previously-unreviewed content visible to students.
export async function publishAllQuestions(paperId: string) {
  await requireAdminUser();

  await db.update(mcqs).set({ status: "published" }).where(eq(mcqs.paperId, paperId));
  revalidatePath(`/admin/papers/${paperId}/questions`);
}

function requireField(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

// Full-field edit — question text/image, all four (plain-text) options,
// correct answer position, difficulty, keywords, and sub-topic
// reassignment. Reuses the exact same resolveOption/isWellFormedUrl/
// parseCorrectAnswerPosition validation Bulk Upload already established, so
// "what counts as a valid option/correct-answer/image URL" stays defined in
// exactly one place.
export async function updateQuestion(formData: FormData) {
  await requireAdminUser();

  const mcqId = requireField(formData.get("mcqId"));
  const paperId = requireField(formData.get("paperId"));
  if (!mcqId) throw new Error("Invalid question.");

  const questionText = requireField(formData.get("questionText")).trim();
  if (!questionText) throw new Error("Question text is required.");

  const questionImageUrl = requireField(formData.get("questionImageUrl")).trim();
  let questionImage: { type: "image"; content: string } | null = null;
  if (questionImageUrl) {
    if (!isWellFormedUrl(questionImageUrl)) {
      throw new Error(`Question Image URL "${questionImageUrl}" is not a well-formed URL.`);
    }
    questionImage = { type: "image", content: questionImageUrl };
  }

  const optionA = resolveOption("Option A", requireField(formData.get("optionA")));
  const optionB = resolveOption("Option B", requireField(formData.get("optionB")));
  const optionC = resolveOption("Option C", requireField(formData.get("optionC")));
  const optionD = resolveOption("Option D", requireField(formData.get("optionD")));
  for (const resolved of [optionA, optionB, optionC, optionD]) {
    if (resolved.error) throw new Error(resolved.error);
  }

  const correctAnswer = parseCorrectAnswerPosition(requireField(formData.get("correctAnswer")));
  if (correctAnswer.error) throw new Error(correctAnswer.error);

  const difficulty = requireField(formData.get("difficulty"));
  if (difficulty !== "easy" && difficulty !== "medium" && difficulty !== "hard") {
    throw new Error("Invalid difficulty.");
  }

  const subTopicId = requireField(formData.get("subTopicId"));
  if (!subTopicId) throw new Error("Sub-topic is required.");
  const subTopic = await db.query.subTopics.findFirst({ where: eq(subTopics.id, subTopicId) });
  if (!subTopic) throw new Error("Selected sub-topic not found.");

  const keywords = requireField(formData.get("keywords"))
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  // Blank is valid — resolves to null, not an empty string, matching Bulk
  // Upload's own hint handling.
  const hint = requireField(formData.get("hint")).trim() || null;

  await db
    .update(mcqs)
    .set({
      questionText,
      questionImage,
      options: [optionA.option!, optionB.option!, optionC.option!, optionD.option!],
      correctOption: correctAnswer.index!,
      difficulty,
      subTopicId,
      keywords,
      hint,
    })
    .where(eq(mcqs.id, mcqId));

  revalidatePath(`/admin/papers/${paperId}/questions`);
  redirect(`/admin/papers/${paperId}/questions`);
}
