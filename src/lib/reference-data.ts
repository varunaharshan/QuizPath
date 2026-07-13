import { asc } from "drizzle-orm";
import { db } from "@/db";
import { grades, paperTypes, subjects } from "@/db/schema";

// Grade and Paper Type used to be Postgres enums, which meant three
// independent, hand-written validators existed across this codebase
// (isValidGrade in src/lib/papers.ts, a second isValidGrade in
// src/app/admin/topics/actions.ts, isGradeValue in src/lib/bulk-upload.ts) —
// all checking membership in the same hardcoded ["10","11"] set, none aware
// of the others. Now that both are real reference tables (see
// src/db/migrate-grade-paper-type-to-tables.ts), there's one real source of
// truth to check against instead: fetch the live list once, then check
// membership against it. isValidGrade/isValidPaperType below are pure
// (take an already-fetched list, matching this codebase's established
// "pass already-fetched data to a pure checker" convention elsewhere, e.g.
// getAdjacentQuestionIds) rather than each doing their own query — a Server
// Component/Action that needs to validate a grade almost always also needs
// the list itself (for a pill row, a dropdown, or an error message listing
// real valid values), so this avoids fetching it twice.

export type Grade = { id: string; value: string; label: string; sortOrder: number };
export type PaperType = { id: string; value: string; label: string; sortOrder: number };

export async function getGrades(): Promise<Grade[]> {
  return db.select().from(grades).orderBy(asc(grades.sortOrder));
}

export async function getPaperTypes(): Promise<PaperType[]> {
  return db.select().from(paperTypes).orderBy(asc(paperTypes.sortOrder));
}

export type SubjectWithMedium = { id: string; name: string; fixedMedium: "sinhala" | "tamil" | "english" | null };

// Every subject, alphabetical, with its fixedMedium — for the reference-data
// admin page's Subjects list. getSubjectsForAdmin (src/lib/admin-topics.ts)
// and getPracticeSubjects (src/lib/papers.ts) both already query `subjects`
// but neither selects fixedMedium (they don't need it), so this is its own
// small query rather than widening either of theirs for one new caller.
export async function getSubjectsWithMedium(): Promise<SubjectWithMedium[]> {
  return db
    .select({ id: subjects.id, name: subjects.name, fixedMedium: subjects.fixedMedium })
    .from(subjects)
    .orderBy(asc(subjects.name));
}

export function isValidGrade(value: string, list: Grade[]): boolean {
  return list.some((g) => g.value === value);
}

export function isValidPaperType(value: string, list: PaperType[]): boolean {
  return list.some((p) => p.value === value);
}

// Falls back to the raw value itself (not a made-up label) if somehow asked
// to label a value not in the list — should only happen for stale data
// referencing a since-removed row, which can't happen today (no delete UI
// exists for either table yet) but is a safer default than throwing.
export function labelForGrade(value: string, list: Grade[]): string {
  return list.find((g) => g.value === value)?.label ?? value;
}

export function labelForPaperType(value: string, list: PaperType[]): string {
  return list.find((p) => p.value === value)?.label ?? value;
}

// Shared by createGrade/createPaperType/createSubject (src/app/admin/
// reference-data/actions.ts) — pulled out as pure functions, the same
// "extract for direct testability" call already made for assignSortOrders
// in src/lib/bulk-upload.ts, since neither needs a DB connection or Clerk's
// currentUser() to exercise. Case-insensitive: "Science" and "science" are
// the same name, matching every other name-matching rule in this app (Bulk
// Upload's subject/topic/sub-topic resolution, the DB's own unique
// constraints on grades.value/paperTypes.value/subjects.name are
// case-sensitive at the DB layer, but this check exists specifically to
// give a clear error before ever reaching that constraint).
export function isDuplicateName(value: string, existingNames: string[]): boolean {
  const normalized = value.toLowerCase();
  return existingNames.some((name) => name.toLowerCase() === normalized);
}

// Auto-assigns the next sortOrder for a newly-added reference-data row
// (current max + 1, or 0 for the first row) — the same "continue after the
// existing max" convention assignSortOrders already established for
// Bulk-Upload-imported paper questions, just for a flat list instead of
// per-paper groups.
export function nextSortOrder(existing: { sortOrder: number }[]): number {
  return existing.length ? Math.max(...existing.map((item) => item.sortOrder)) + 1 : 0;
}

export function isValidMedium(value: unknown): value is "sinhala" | "tamil" | "english" {
  return value === "sinhala" || value === "tamil" || value === "english";
}

// Shared by createPaper/updatePaper (src/app/admin/papers/actions.ts) — pulled
// out as a pure function (no DB call, no Clerk) so it's directly testable
// without importing that "use server" file into a test, which drags in
// Next.js's app-router context and breaks under vitest's plain node
// environment. A fixed-medium subject (e.g. English) only ever exists in its
// own one medium, so the admin's submitted value is overridden server-side
// regardless of what the form sent; otherwise the submitted value is used,
// after validating it's actually one of the three real values.
export function resolveMediumValue(
  fixedMedium: "sinhala" | "tamil" | "english" | null,
  submittedMedium: unknown,
): "sinhala" | "tamil" | "english" {
  if (fixedMedium) return fixedMedium;
  if (!isValidMedium(submittedMedium)) throw new Error("Invalid medium.");
  return submittedMedium;
}
