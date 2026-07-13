"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { grades, paperTypes, subjects } from "@/db/schema";
import { requireAdminUser } from "@/lib/current-app-user";
import { getGrades, getPaperTypes, isDuplicateName, nextSortOrder } from "@/lib/reference-data";

function requireField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

// Same "no delete/edit yet, just adding new ones" scope as every other
// reference-data list in this admin area — sortOrder is auto-assigned
// (current max + 1) rather than exposed as a form field, matching how
// Bulk Upload's own assignSortOrders continues after a paper's existing
// max instead of asking the admin to pick a number.
export async function createGrade(formData: FormData) {
  await requireAdminUser();

  const value = requireField(formData, "value");
  const label = requireField(formData, "label");
  if (!value) throw new Error("Value is required.");
  if (!label) throw new Error("Label is required.");

  const existing = await getGrades();
  if (isDuplicateName(value, existing.map((g) => g.value))) {
    throw new Error(`Grade "${value}" already exists.`);
  }

  await db.insert(grades).values({ value, label, sortOrder: nextSortOrder(existing) });
  revalidatePath("/admin/reference-data");
}

export async function createPaperType(formData: FormData) {
  await requireAdminUser();

  const value = requireField(formData, "value");
  const label = requireField(formData, "label");
  if (!value) throw new Error("Value is required.");
  if (!label) throw new Error("Label is required.");

  const existing = await getPaperTypes();
  if (isDuplicateName(value, existing.map((p) => p.value))) {
    throw new Error(`Paper type "${value}" already exists.`);
  }

  await db.insert(paperTypes).values({ value, label, sortOrder: nextSortOrder(existing) });
  revalidatePath("/admin/reference-data");
}

// A subject is just a name — no medium/language field. See CLAUDE.md
// "Medium and papers" for why: a subject and the medium a specific paper
// happens to be written in are independent concepts, and the combination
// only ever lives on `papers`.
export async function createSubject(formData: FormData) {
  await requireAdminUser();

  const name = requireField(formData, "name");
  if (!name) throw new Error("Name is required.");

  const existing = await db.select({ name: subjects.name }).from(subjects);
  if (isDuplicateName(name, existing.map((s) => s.name))) {
    throw new Error(`Subject "${name}" already exists.`);
  }

  await db.insert(subjects).values({ name });
  revalidatePath("/admin/reference-data");
}
