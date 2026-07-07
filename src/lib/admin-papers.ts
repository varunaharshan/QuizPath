import { and, count, eq, ilike, inArray } from "drizzle-orm";
import { db } from "@/db";
import { mcqs, papers, subjects } from "@/db/schema";
import type { PaperTypeValue } from "@/lib/papers";

export type AdminPaper = {
  id: string;
  title: string;
  subjectId: string;
  subjectName: string;
  grade: "10" | "11";
  paperType: PaperTypeValue;
  year: number | null;
  status: "draft" | "published";
  questionCount: number;
};

export type AdminPapersFilters = {
  subjectId?: string;
  grade?: "10" | "11";
  // Case-insensitive substring match against the paper's title.
  search?: string;
};

// Unlike Topics (always scoped to one subject+grade the admin has picked)
// Papers Management defaults to showing every paper across every subject and
// grade — an admin managing content wants the full picture first, narrowing
// with filters, rather than always starting from one definite subject+grade
// the way a student's own browsing always does.
export async function getPapersForAdmin(filters: AdminPapersFilters): Promise<AdminPaper[]> {
  const conditions = [];
  if (filters.subjectId) conditions.push(eq(papers.subjectId, filters.subjectId));
  if (filters.grade) conditions.push(eq(papers.grade, filters.grade));
  if (filters.search) conditions.push(ilike(papers.title, `%${filters.search}%`));

  const rows = await db
    .select({
      id: papers.id,
      title: papers.title,
      subjectId: papers.subjectId,
      subjectName: subjects.name,
      grade: papers.grade,
      paperType: papers.paperType,
      year: papers.year,
      status: papers.status,
    })
    .from(papers)
    .innerJoin(subjects, eq(papers.subjectId, subjects.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(subjects.name, papers.grade, papers.title);

  // Live count, same reasoning as getTopicsForSubjectGrade: this is also
  // what the delete-confirmation warning shows, not a cached number.
  const paperIds = rows.map((r) => r.id);
  const mcqCounts = paperIds.length
    ? await db
        .select({ paperId: mcqs.paperId, count: count() })
        .from(mcqs)
        .where(inArray(mcqs.paperId, paperIds))
        .groupBy(mcqs.paperId)
    : [];
  const countByPaper = new Map(mcqCounts.map((row) => [row.paperId as string, Number(row.count)]));

  return rows.map((row) => ({ ...row, questionCount: countByPaper.get(row.id) ?? 0 }));
}

export type AdminPaperDetail = {
  id: string;
  title: string;
  subjectId: string;
  grade: "10" | "11";
  paperType: PaperTypeValue;
  year: number | null;
  status: "draft" | "published";
};

export async function getPaperForAdmin(paperId: string): Promise<AdminPaperDetail | null> {
  const paper = await db.query.papers.findFirst({ where: eq(papers.id, paperId) });
  if (!paper) return null;
  return {
    id: paper.id,
    title: paper.title,
    subjectId: paper.subjectId,
    grade: paper.grade,
    paperType: paper.paperType,
    year: paper.year,
    status: paper.status,
  };
}
