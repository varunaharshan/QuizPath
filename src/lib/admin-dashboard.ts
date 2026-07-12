import { alias } from "drizzle-orm/pg-core";
import { and, count, countDistinct, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { mcqs, modules, papers, quizAttempts, subjects, subTopics } from "@/db/schema";
import { getSubjectsForAdmin, type AdminTopic } from "@/lib/admin-topics";

// Everything here is admin-only and deliberately independent of
// src/lib/dashboard.ts / src/lib/papers.ts / src/lib/practice.ts (the
// student-facing query modules) — no imports from any of them, and nothing
// here is imported by student-facing code either. Where an admin-only query
// already exists (getTopicsForSubjectGrade, getSubjectsForAdmin in
// src/lib/admin-topics.ts), it's reused directly rather than duplicated.

export type AdminOverviewStats = {
  totalQuestions: number;
  totalPapers: number;
  pendingReview: number;
  // Distinct students with at least one quiz_attempts row, ever (any type,
  // any completion state) — there's no other site-wide "active student"
  // aggregate anywhere in this app to match, so this is the simplest real
  // definition: has this student engaged with the platform at all.
  activeStudents: number;
};

// Accepts an optional executor (defaulting to the module-level db) purely so
// tests can pass a single transaction and get an exact, race-free delta —
// see tests/admin-dashboard.test.ts's own comment on why a plain db read is
// flaky for a genuinely site-wide, concurrently-mutated aggregate like this
// one. Callers outside tests never need to pass this. Queries run
// sequentially rather than via Promise.all: a transaction executor is bound
// to a single connection, which can only run one query at a time — firing
// several concurrently against it only works today via pg's own (soon to be
// removed) implicit query queuing.
export async function getAdminOverviewStats(executor: Pick<typeof db, "select"> = db): Promise<AdminOverviewStats> {
  const [questionRow] = await executor.select({ value: count() }).from(mcqs);
  const [paperRow] = await executor.select({ value: count() }).from(papers);
  const [pendingRow] = await executor
    .select({ value: count() })
    .from(mcqs)
    .where(eq(mcqs.verificationStatus, "unverified"));
  const [studentRow] = await executor.select({ value: countDistinct(quizAttempts.studentId) }).from(quizAttempts);

  return {
    totalQuestions: questionRow.value,
    totalPapers: paperRow.value,
    pendingReview: pendingRow.value,
    activeStudents: studentRow.value,
  };
}

export type SubjectCoverage = {
  subjectId: string;
  subjectName: string;
  questionCount: number;
};

// Landing-state ("no grade/subject selected yet") coverage list — every
// subject in the system, with its real total question count across every
// grade. A question can reach a subject via two paths (its own sub-topic's
// module, or the paper it's attached to), and the two can disagree only in
// theory, never in practice, so each mcq is attributed once via
// coalesce(paper's subjectId, module's subjectId) rather than summing two
// separately-grouped counts, which would double-count a question reachable
// via both paths. Subjects with zero questions are still included (at 0),
// since surfacing "this subject exists but has nothing yet" is the point of
// a coverage view.
export async function getAdminContentCoverageBySubject(): Promise<SubjectCoverage[]> {
  const [allSubjects, countRows] = await Promise.all([
    getSubjectsForAdmin(),
    db
      .select({
        subjectId: sql<string | null>`coalesce(${papers.subjectId}, ${modules.subjectId})`.as("resolved_subject_id"),
        value: count(),
      })
      .from(mcqs)
      .leftJoin(papers, eq(papers.id, mcqs.paperId))
      .leftJoin(subTopics, eq(subTopics.id, mcqs.subTopicId))
      .leftJoin(modules, eq(modules.id, subTopics.moduleId))
      .groupBy(sql`coalesce(${papers.subjectId}, ${modules.subjectId})`),
  ]);

  const countBySubject = new Map(countRows.filter((r) => r.subjectId !== null).map((r) => [r.subjectId as string, r.value]));

  return allSubjects
    .map((subject) => ({
      subjectId: subject.id,
      subjectName: subject.name,
      questionCount: countBySubject.get(subject.id) ?? 0,
    }))
    .sort((a, b) => b.questionCount - a.questionCount);
}

// Grade pill row — real distinct grades with at least one module or paper,
// any status (unlike the student-facing getGradesWithPapers, which is
// published-only — an admin needs to see a grade that only has draft
// content too).
export async function getGradesWithContent(): Promise<string[]> {
  const [moduleGrades, paperGrades] = await Promise.all([
    db.selectDistinct({ grade: modules.grade }).from(modules),
    db.selectDistinct({ grade: papers.grade }).from(papers),
  ]);
  const grades = new Set([...moduleGrades.map((r) => r.grade), ...paperGrades.map((r) => r.grade)]);
  return [...grades].sort();
}

// Subject pill row, scoped to a grade — same "any status" reasoning as
// getGradesWithContent, so this is a distinct admin-only function rather
// than reusing the student-facing getSubjectsForGrade (published-papers-only).
export async function getSubjectsWithContentForGrade(grade: string): Promise<{ id: string; name: string }[]> {
  const [moduleSubjectRows, paperSubjectRows] = await Promise.all([
    db.selectDistinct({ id: modules.subjectId }).from(modules).where(eq(modules.grade, grade)),
    db.selectDistinct({ id: papers.subjectId }).from(papers).where(eq(papers.grade, grade)),
  ]);
  const subjectIds = [...new Set([...moduleSubjectRows.map((r) => r.id), ...paperSubjectRows.map((r) => r.id)])];
  if (subjectIds.length === 0) return [];

  const allSubjects = await getSubjectsForAdmin();
  const idSet = new Set(subjectIds);
  return allSubjects.filter((s) => idSet.has(s.id));
}

export type ScopedKpis = {
  totalQuestions: number;
  topicsCoveredCount: number;
  topicsTotalCount: number;
  emptySubTopicCount: number;
  papersUsingSubject: number;
};

// Everything derivable from an already-fetched getTopicsForSubjectGrade()
// result is computed here in JS rather than re-queried — only
// papersUsingSubject needs a real query, since paper count isn't part of
// that topic tree.
export async function getScopedKpis(
  subjectId: string,
  grade: string,
  topics: AdminTopic[],
): Promise<ScopedKpis> {
  const totalQuestions = topics.reduce((sum, t) => sum + t.questionCount, 0);
  const topicsCoveredCount = topics.filter((t) => t.questionCount > 0).length;
  const emptySubTopicCount = topics.reduce(
    (sum, t) => sum + t.subTopics.filter((s) => s.questionCount === 0).length,
    0,
  );

  const [{ value: papersUsingSubject }] = await db
    .select({ value: count() })
    .from(papers)
    .where(and(eq(papers.subjectId, subjectId), eq(papers.grade, grade)));

  return {
    totalQuestions,
    topicsCoveredCount,
    topicsTotalCount: topics.length,
    emptySubTopicCount,
    papersUsingSubject,
  };
}

export type CoverageGap = {
  subTopicId: string;
  subTopicName: string;
  topicId: string;
  topicName: string;
};

// Pure — no query of its own. Every sub-topic across an already-fetched
// getTopicsForSubjectGrade() result whose live questionCount is 0, flattened
// with its parent topic's name for display context.
export function getCoverageGaps(topics: AdminTopic[]): CoverageGap[] {
  return topics.flatMap((topic) =>
    topic.subTopics
      .filter((subTopic) => subTopic.questionCount === 0)
      .map((subTopic) => ({
        subTopicId: subTopic.id,
        subTopicName: subTopic.name,
        topicId: topic.id,
        topicName: topic.name,
      })),
  );
}

export type UnverifiedQuestion = {
  id: string;
  questionText: string;
  subjectName: string | null;
  grade: string | null;
  paperId: string | null;
  paperTitle: string | null;
};

// Backs the "Pending Review" KPI's click-through. Every unverified question
// site-wide, regardless of paper. A question's subject/grade is resolved via
// whichever path it actually has (its paper, or its sub-topic's module) —
// the same coalesce-two-paths reasoning as getAdminContentCoverageBySubject,
// just resolved per-row here instead of grouped/counted. Rows with a
// paperId link into the existing per-paper edit route; a standalone
// (no-paper) question has no edit route yet (see CLAUDE.md "What's NOT
// built yet" — no global question-bank view exists), so it's shown
// read-only here rather than building that out.
export async function getUnverifiedQuestions(): Promise<UnverifiedQuestion[]> {
  const paperSubject = alias(subjects, "paper_subject");
  const moduleSubject = alias(subjects, "module_subject");

  const rows = await db
    .select({
      id: mcqs.id,
      questionText: mcqs.questionText,
      paperId: mcqs.paperId,
      paperTitle: papers.title,
      paperGrade: papers.grade,
      paperSubjectName: paperSubject.name,
      moduleGrade: modules.grade,
      moduleSubjectName: moduleSubject.name,
    })
    .from(mcqs)
    .leftJoin(papers, eq(papers.id, mcqs.paperId))
    .leftJoin(paperSubject, eq(paperSubject.id, papers.subjectId))
    .leftJoin(subTopics, eq(subTopics.id, mcqs.subTopicId))
    .leftJoin(modules, eq(modules.id, subTopics.moduleId))
    .leftJoin(moduleSubject, eq(moduleSubject.id, modules.subjectId))
    .where(eq(mcqs.verificationStatus, "unverified"))
    .orderBy(mcqs.createdAt);

  return rows.map((row) => ({
    id: row.id,
    questionText: row.questionText,
    paperId: row.paperId,
    paperTitle: row.paperTitle,
    subjectName: row.paperSubjectName ?? row.moduleSubjectName ?? null,
    grade: row.paperGrade ?? row.moduleGrade ?? null,
  }));
}
