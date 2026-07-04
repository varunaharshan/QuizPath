import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { papers, quizAttempts, subjects } from "@/db/schema";

export type PracticeSubject = { id: string; name: string };

// Real query, not hardcoded — Science is the only row today, but more
// subjects slot in automatically as they're added.
export async function getPracticeSubjects(): Promise<PracticeSubject[]> {
  return db.select({ id: subjects.id, name: subjects.name }).from(subjects).orderBy(subjects.name);
}

export type SubjectInfo = {
  id: string;
  name: string;
  fixedMedium: "sinhala" | "tamil" | "english" | null;
};

export async function getSubjectById(subjectId: string): Promise<SubjectInfo | null> {
  const subject = await db.query.subjects.findFirst({ where: eq(subjects.id, subjectId) });
  return subject ?? null;
}

export type PaperAttemptStatus = "not_started" | "in_progress" | "completed";

export type PaperListItem = {
  id: string;
  title: string;
  year: number | null;
  source: string | null;
  status: PaperAttemptStatus;
};

export type GroupedPapers = {
  provincial: PaperListItem[];
  district: PaperListItem[];
  school: PaperListItem[];
};

// Filtered by grade and by whichever medium applies (the subject's
// fixed_medium if it has one, otherwise the student's profile medium —
// resolved by the caller before calling this), grouped by paper_type, each
// tagged with the student's Start/Resume/Retake status for it.
export async function getPapersForSubject(params: {
  subjectId: string;
  grade: "10" | "11";
  medium: "sinhala" | "tamil" | "english";
  studentId: string;
}): Promise<GroupedPapers> {
  const { subjectId, grade, medium, studentId } = params;

  const paperRows = await db
    .select({
      id: papers.id,
      title: papers.title,
      year: papers.year,
      source: papers.source,
      paperType: papers.paperType,
    })
    .from(papers)
    .where(
      and(
        eq(papers.subjectId, subjectId),
        eq(papers.grade, grade),
        eq(papers.medium, medium),
        eq(papers.status, "published"),
      ),
    )
    .orderBy(papers.paperType, papers.year);

  const grouped: GroupedPapers = { provincial: [], district: [], school: [] };
  if (paperRows.length === 0) return grouped;

  const paperIds = paperRows.map((p) => p.id);
  const attempts = await db
    .select({ paperId: quizAttempts.paperId, completedAt: quizAttempts.completedAt })
    .from(quizAttempts)
    .where(and(eq(quizAttempts.studentId, studentId), inArray(quizAttempts.paperId, paperIds)));

  const statusByPaper = new Map<string, PaperAttemptStatus>();
  for (const attempt of attempts) {
    if (!attempt.paperId) continue;
    if (attempt.completedAt === null) {
      statusByPaper.set(attempt.paperId, "in_progress");
    } else if (statusByPaper.get(attempt.paperId) !== "in_progress") {
      statusByPaper.set(attempt.paperId, "completed");
    }
  }

  for (const paper of paperRows) {
    grouped[paper.paperType].push({
      id: paper.id,
      title: paper.title,
      year: paper.year,
      source: paper.source,
      status: statusByPaper.get(paper.id) ?? "not_started",
    });
  }

  return grouped;
}
