"use server";

import { and, asc, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { modules, subTopics } from "@/db/schema";
import { requireAdminUser } from "@/lib/current-app-user";
import { getGrades, isValidGrade } from "@/lib/reference-data";

export async function createModule(formData: FormData) {
  await requireAdminUser();

  const subjectId = formData.get("subjectId");
  const grade = formData.get("grade");
  const name = formData.get("name");
  if (typeof subjectId !== "string" || !subjectId) {
    throw new Error("Invalid subject.");
  }
  if (typeof grade !== "string" || !isValidGrade(grade, await getGrades())) {
    throw new Error("Invalid grade.");
  }
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Topic name is required.");
  }

  const [{ maxSortOrder }] = await db
    .select({ maxSortOrder: max(modules.sortOrder) })
    .from(modules)
    .where(and(eq(modules.subjectId, subjectId), eq(modules.grade, grade)));

  await db.insert(modules).values({
    subjectId,
    grade,
    name: name.trim(),
    sortOrder: (maxSortOrder ?? -1) + 1,
  });

  revalidatePath("/admin/topics");
}

export async function renameModule(formData: FormData) {
  await requireAdminUser();

  const moduleId = formData.get("moduleId");
  const name = formData.get("name");
  if (typeof moduleId !== "string" || !moduleId) {
    throw new Error("Invalid topic.");
  }
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Topic name is required.");
  }

  await db.update(modules).set({ name: name.trim() }).where(eq(modules.id, moduleId));
  revalidatePath("/admin/topics");
}

// Deletion itself is unconditional here — the warning (question count) is
// computed server-side (getTopicsForSubjectGrade) and shown client-side via
// <ConfirmSubmitButton> before this action ever runs; this action doesn't
// re-block on a count, matching "warn before allowing deletion" rather than
// "prevent deletion outright". Cascades through sub_topics -> mcqs per the
// existing onDelete: cascade FKs.
export async function deleteModule(formData: FormData) {
  await requireAdminUser();

  const moduleId = formData.get("moduleId");
  if (typeof moduleId !== "string" || !moduleId) {
    throw new Error("Invalid topic.");
  }

  await db.delete(modules).where(eq(modules.id, moduleId));
  revalidatePath("/admin/topics");
}

// Swaps sort_order with the adjacent sibling within the same subject+grade
// (modules' own natural grouping) — a no-op at either boundary rather than
// wrapping around. moduleId/direction are bound via .bind() on the button's
// formAction (see admin/topics/page.tsx) rather than read off FormData —
// a plain name="direction" input on a button whose formAction is itself a
// function conflicts with Next's auto-generated action-encoding name and
// triggers a hydration mismatch.
export async function reorderModule(moduleId: string, direction: "up" | "down") {
  await requireAdminUser();

  const current = await db.query.modules.findFirst({ where: eq(modules.id, moduleId) });
  if (!current) {
    throw new Error("Topic not found.");
  }

  const siblings = await db
    .select()
    .from(modules)
    .where(and(eq(modules.subjectId, current.subjectId), eq(modules.grade, current.grade)))
    .orderBy(asc(modules.sortOrder));

  const index = siblings.findIndex((m) => m.id === moduleId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= siblings.length) {
    return;
  }

  const swapWith = siblings[swapIndex];
  await db.transaction(async (tx) => {
    await tx.update(modules).set({ sortOrder: swapWith.sortOrder }).where(eq(modules.id, current.id));
    await tx.update(modules).set({ sortOrder: current.sortOrder }).where(eq(modules.id, swapWith.id));
  });

  revalidatePath("/admin/topics");
}

export async function createSubTopic(formData: FormData) {
  await requireAdminUser();

  const moduleId = formData.get("moduleId");
  const name = formData.get("name");
  if (typeof moduleId !== "string" || !moduleId) {
    throw new Error("Invalid topic.");
  }
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Sub-topic name is required.");
  }

  const [{ maxSortOrder }] = await db
    .select({ maxSortOrder: max(subTopics.sortOrder) })
    .from(subTopics)
    .where(eq(subTopics.moduleId, moduleId));

  await db.insert(subTopics).values({
    moduleId,
    name: name.trim(),
    sortOrder: (maxSortOrder ?? -1) + 1,
  });

  revalidatePath("/admin/topics");
}

export async function renameSubTopic(formData: FormData) {
  await requireAdminUser();

  const subTopicId = formData.get("subTopicId");
  const name = formData.get("name");
  if (typeof subTopicId !== "string" || !subTopicId) {
    throw new Error("Invalid sub-topic.");
  }
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Sub-topic name is required.");
  }

  await db.update(subTopics).set({ name: name.trim() }).where(eq(subTopics.id, subTopicId));
  revalidatePath("/admin/topics");
}

// Same "warn, don't block" reasoning as deleteModule — cascades to mcqs.
export async function deleteSubTopic(formData: FormData) {
  await requireAdminUser();

  const subTopicId = formData.get("subTopicId");
  if (typeof subTopicId !== "string" || !subTopicId) {
    throw new Error("Invalid sub-topic.");
  }

  await db.delete(subTopics).where(eq(subTopics.id, subTopicId));
  revalidatePath("/admin/topics");
}

// Swaps sort_order with the adjacent sibling within the same module.
// subTopicId/direction are bound via .bind() on the button's formAction —
// see reorderModule above for why.
export async function reorderSubTopic(subTopicId: string, direction: "up" | "down") {
  await requireAdminUser();

  const current = await db.query.subTopics.findFirst({ where: eq(subTopics.id, subTopicId) });
  if (!current) {
    throw new Error("Sub-topic not found.");
  }

  const siblings = await db
    .select()
    .from(subTopics)
    .where(eq(subTopics.moduleId, current.moduleId))
    .orderBy(asc(subTopics.sortOrder));

  const index = siblings.findIndex((s) => s.id === subTopicId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= siblings.length) {
    return;
  }

  const swapWith = siblings[swapIndex];
  await db.transaction(async (tx) => {
    await tx.update(subTopics).set({ sortOrder: swapWith.sortOrder }).where(eq(subTopics.id, current.id));
    await tx.update(subTopics).set({ sortOrder: current.sortOrder }).where(eq(subTopics.id, swapWith.id));
  });

  revalidatePath("/admin/topics");
}
