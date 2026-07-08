import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mcqs, modules, papers, subjects, subTopics, type QuestionImage, type QuestionOption } from "@/db/schema";
import type { BulkUploadReferenceData } from "@/lib/bulk-upload";

// Everything the bulk-upload review step needs to resolve a CSV row's
// subject/topic/sub-topic/paper-reference names to real ids, fetched once
// per page load rather than per row (see bulk-upload.ts's own comment on
// why this is a full-list load).
export async function getBulkUploadReferenceData(): Promise<BulkUploadReferenceData> {
  const [subjectRows, moduleRows, subTopicRows, paperRows] = await Promise.all([
    db.select({ id: subjects.id, name: subjects.name }).from(subjects),
    db
      .select({ id: modules.id, name: modules.name, subjectId: modules.subjectId, grade: modules.grade })
      .from(modules),
    db.select({ id: subTopics.id, name: subTopics.name, moduleId: subTopics.moduleId }).from(subTopics),
    db.select({ id: papers.id, title: papers.title, subjectId: papers.subjectId, grade: papers.grade }).from(papers),
  ]);

  return { subjects: subjectRows, modules: moduleRows, subTopics: subTopicRows, papers: paperRows };
}

export type AdminPaperQuestion = {
  id: string;
  questionText: string;
  questionImage: QuestionImage | null;
  options: QuestionOption[];
  correctOption: number;
  difficulty: "easy" | "medium" | "hard";
  keywords: string[];
  hint: string | null;
  // Whether this individual question is actually servable to students —
  // independent of the paper's own draft/published status and of
  // verificationStatus (a question can be published-but-unreviewed or
  // draft-but-already-verified; the two gates don't imply each other).
  status: "draft" | "published";
  verificationStatus: "unverified" | "verified";
  subTopicId: string | null;
  subTopicName: string | null;
  moduleId: string | null;
  moduleName: string | null;
};

export type AdminPaperSummary = {
  id: string;
  title: string;
  grade: "10" | "11";
  subjectId: string;
  subjectName: string;
};

// Everything /admin/papers/[paperId]/questions needs: the paper itself (for
// the page header and to scope the edit page's Topic dropdown to the same
// grade+subject) plus every question tagged with it, joined out to its
// sub-topic/topic names the same manual-leftJoin way getQuizForPaper already
// does (mcqs has no relations() entry of its own, unlike sub_topics/modules,
// so this follows that established pattern rather than the relational query
// builder).
export async function getPaperForQuestionsAdmin(paperId: string): Promise<AdminPaperSummary | null> {
  const rows = await db
    .select({
      id: papers.id,
      title: papers.title,
      grade: papers.grade,
      subjectId: papers.subjectId,
      subjectName: subjects.name,
    })
    .from(papers)
    .innerJoin(subjects, eq(papers.subjectId, subjects.id))
    .where(eq(papers.id, paperId))
    .limit(1);

  return rows[0] ?? null;
}

export async function getQuestionsForPaper(paperId: string): Promise<AdminPaperQuestion[]> {
  const rows = await db
    .select({
      id: mcqs.id,
      questionText: mcqs.questionText,
      questionImage: mcqs.questionImage,
      options: mcqs.options,
      correctOption: mcqs.correctOption,
      difficulty: mcqs.difficulty,
      keywords: mcqs.keywords,
      hint: mcqs.hint,
      status: mcqs.status,
      verificationStatus: mcqs.verificationStatus,
      subTopicId: mcqs.subTopicId,
      subTopicName: subTopics.name,
      moduleId: modules.id,
      moduleName: modules.name,
    })
    .from(mcqs)
    .leftJoin(subTopics, eq(subTopics.id, mcqs.subTopicId))
    .leftJoin(modules, eq(modules.id, subTopics.moduleId))
    .where(eq(mcqs.paperId, paperId))
    .orderBy(mcqs.createdAt);

  return rows.map((row) => ({
    ...row,
    subTopicId: row.subTopicId ?? null,
    moduleId: row.moduleId ?? null,
  }));
}

export type AdminQuestionDetail = AdminPaperQuestion & { paperId: string | null };

export async function getQuestionForEdit(mcqId: string): Promise<AdminQuestionDetail | null> {
  const rows = await db
    .select({
      id: mcqs.id,
      questionText: mcqs.questionText,
      questionImage: mcqs.questionImage,
      options: mcqs.options,
      correctOption: mcqs.correctOption,
      difficulty: mcqs.difficulty,
      keywords: mcqs.keywords,
      hint: mcqs.hint,
      status: mcqs.status,
      verificationStatus: mcqs.verificationStatus,
      subTopicId: mcqs.subTopicId,
      subTopicName: subTopics.name,
      moduleId: modules.id,
      moduleName: modules.name,
      paperId: mcqs.paperId,
    })
    .from(mcqs)
    .leftJoin(subTopics, eq(subTopics.id, mcqs.subTopicId))
    .leftJoin(modules, eq(modules.id, subTopics.moduleId))
    .where(eq(mcqs.id, mcqId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return { ...row, subTopicId: row.subTopicId ?? null, moduleId: row.moduleId ?? null };
}
