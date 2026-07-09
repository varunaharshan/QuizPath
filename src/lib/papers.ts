import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { mcqs, modules, papers, quizAttemptAnswers, quizAttempts, subjects } from "@/db/schema";
import { MARKS_PER_QUESTION } from "@/lib/quiz";

// Practice's Grade step is a free browsing choice (not tied to the student's
// own student_profiles.grade), so route params need validating rather than
// trusted as "10" | "11" outright.
export function isValidGrade(value: string): value is "10" | "11" {
  return value === "10" || value === "11";
}

export type PracticeSubject = { id: string; name: string };

// Real query, not hardcoded — Science is the only row today, but more
// subjects slot in automatically as they're added.
export async function getPracticeSubjects(): Promise<PracticeSubject[]> {
  return db.select({ id: subjects.id, name: subjects.name }).from(subjects).orderBy(subjects.name);
}

// The Dashboard's "Your subjects" switcher — subjects that actually have
// something for this grade (at least one Topic/module, or at least one
// published paper), not literally every row in `subjects` the way
// getPracticeSubjects does. There's no per-student enrollment concept in
// this single-tenant schema (see CLAUDE.md "Single-tenant MVP") — "the
// student's subjects" is defined the same way every other grade-scoped
// list in this app already is: real content for that grade, resolved from
// two separate distinct-subject-id queries (modules and papers) and
// unioned in JS, mirroring getCompletedQuizzes's own "resolve via two
// queries, merge afterward" shape rather than one query needing `subjects`
// joined in twice. A module has no draft/published status of its own (only
// mcqs/papers do), so any module for the grade counts; a paper only counts
// once it's published, matching every other student-facing paper query.
export async function getSubjectsForGrade(grade: "10" | "11"): Promise<PracticeSubject[]> {
  const moduleSubjectRows = await db
    .selectDistinct({ id: modules.subjectId })
    .from(modules)
    .where(eq(modules.grade, grade));
  const paperSubjectRows = await db
    .selectDistinct({ id: papers.subjectId })
    .from(papers)
    .where(and(eq(papers.grade, grade), eq(papers.status, "published")));

  const subjectIds = [...new Set([...moduleSubjectRows.map((r) => r.id), ...paperSubjectRows.map((r) => r.id)])];
  if (subjectIds.length === 0) return [];

  return db
    .select({ id: subjects.id, name: subjects.name })
    .from(subjects)
    .where(inArray(subjects.id, subjectIds))
    .orderBy(subjects.name);
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

export type PaperTypeValue = "provincial" | "district" | "school";

export const PAPER_TYPE_LABELS: Record<PaperTypeValue, string> = {
  provincial: "Provincial",
  district: "District",
  school: "School",
};

// The Papers filter form's Paper Type dropdown is a free query-string choice
// (like grade), so it needs validating rather than trusted outright.
export function isValidPaperType(value: string): value is PaperTypeValue {
  return value === "provincial" || value === "district" || value === "school";
}

export type PaperAttemptStatus = "not_started" | "in_progress" | "completed";

// Shared status resolution for the grade-wide Papers grid/overview —
// same "in_progress beats completed" precedence getPapersForSubject already
// established (an in-progress attempt always wins even if an older completed
// one exists for the same paper), plus the answered-count a resumed card/
// overview needs to show "In progress · X/Y answered". Returns two maps
// rather than one combined shape since answeredCount only ever applies to
// in_progress papers — every other status has nothing to count.
async function resolvePaperStatuses(
  studentId: string,
  paperIds: string[],
): Promise<{
  statusByPaper: Map<string, PaperAttemptStatus>;
  answeredCountByPaper: Map<string, number>;
}> {
  if (paperIds.length === 0) {
    return { statusByPaper: new Map(), answeredCountByPaper: new Map() };
  }

  const attempts = await db
    .select({ id: quizAttempts.id, paperId: quizAttempts.paperId, completedAt: quizAttempts.completedAt })
    .from(quizAttempts)
    .where(and(eq(quizAttempts.studentId, studentId), inArray(quizAttempts.paperId, paperIds)));

  const statusByPaper = new Map<string, PaperAttemptStatus>();
  const inProgressAttemptByPaper = new Map<string, string>();
  for (const attempt of attempts) {
    if (!attempt.paperId) continue;
    if (attempt.completedAt === null) {
      statusByPaper.set(attempt.paperId, "in_progress");
      inProgressAttemptByPaper.set(attempt.paperId, attempt.id);
    } else if (statusByPaper.get(attempt.paperId) !== "in_progress") {
      statusByPaper.set(attempt.paperId, "completed");
    }
  }

  const inProgressAttemptIds = [...inProgressAttemptByPaper.values()];
  const answeredCounts = inProgressAttemptIds.length
    ? await db
        .select({ quizAttemptId: quizAttemptAnswers.quizAttemptId, count: count() })
        .from(quizAttemptAnswers)
        .where(inArray(quizAttemptAnswers.quizAttemptId, inProgressAttemptIds))
        .groupBy(quizAttemptAnswers.quizAttemptId)
    : [];
  const answeredCountByAttempt = new Map(answeredCounts.map((row) => [row.quizAttemptId, Number(row.count)]));

  const answeredCountByPaper = new Map<string, number>();
  for (const [paperId, attemptId] of inProgressAttemptByPaper) {
    answeredCountByPaper.set(paperId, answeredCountByAttempt.get(attemptId) ?? 0);
  }

  return { statusByPaper, answeredCountByPaper };
}

// Real distinct grades that actually have a published paper, for the Papers
// grid's Grade pill row — not hardcoded, so a grade with no papers yet
// (or not yet used) simply doesn't get a pill. Ordered "10" before "11"
// rather than however Postgres happens to return them.
export async function getGradesWithPapers(): Promise<("10" | "11")[]> {
  const rows = await db
    .selectDistinct({ grade: papers.grade })
    .from(papers)
    .where(eq(papers.status, "published"));
  const present = new Set(rows.map((r) => r.grade));
  return (["10", "11"] as const).filter((g) => present.has(g));
}

export type SubjectPaperGroup = {
  subjectId: string;
  subjectName: string;
  papers: GradePaperCard[];
};

// Buckets an already-fetched grade-wide paper list by subject, for the
// Papers grid's subject-tab switcher — the same "group by subject for a
// client-side tab switcher" shape groupTopicsBySubject established for
// Practice by Topic. Preserves getPapersForGrade's own per-subject paper
// order (already sorted by paper type/year/title) and sorts the groups
// themselves by subject name for a stable tab order.
export function groupPapersBySubject(papersForGrade: GradePaperCard[]): SubjectPaperGroup[] {
  const bySubject = new Map<string, SubjectPaperGroup>();
  for (const paper of papersForGrade) {
    let group = bySubject.get(paper.subjectId);
    if (!group) {
      group = { subjectId: paper.subjectId, subjectName: paper.subjectName, papers: [] };
      bySubject.set(paper.subjectId, group);
    }
    group.papers.push(paper);
  }
  return [...bySubject.values()].sort((a, b) => a.subjectName.localeCompare(b.subjectName));
}

export type GradePaperCard = {
  id: string;
  title: string;
  subjectId: string;
  subjectName: string;
  paperType: PaperTypeValue;
  year: number | null;
  questionCount: number;
  totalMarks: number;
  timeLimitMinutes: number | null;
  status: PaperAttemptStatus;
  // Only set when status is "in_progress" — every other status has no
  // partial-answer count to show.
  answeredCount: number | null;
};

// Grade-wide, multi-subject fetch for the new Papers grid — one query covers
// every subject at once so switching the Subject tab is pure client state
// (mirroring <TopicCardGrid>'s "fetch once, tab-switch client-side" shape)
// and only a Grade change causes a real navigation/refetch, same as every
// other cascading filter in this app. Medium is resolved per-paper's own
// subject (subject.fixedMedium ?? the student's own profile medium) since a
// grade-wide fetch can span subjects with different fixed mediums, unlike
// the old single-subject getPapersForSubject which took one resolved medium.
export async function getPapersForGrade(params: {
  grade: "10" | "11";
  studentMedium: "sinhala" | "tamil" | "english";
  studentId: string;
}): Promise<GradePaperCard[]> {
  const { grade, studentMedium, studentId } = params;

  const rows = await db
    .select({
      id: papers.id,
      title: papers.title,
      subjectId: papers.subjectId,
      subjectName: subjects.name,
      subjectFixedMedium: subjects.fixedMedium,
      medium: papers.medium,
      paperType: papers.paperType,
      year: papers.year,
      timeLimitMinutes: papers.timeLimitMinutes,
    })
    .from(papers)
    .innerJoin(subjects, eq(papers.subjectId, subjects.id))
    .where(and(eq(papers.grade, grade), eq(papers.status, "published")))
    .orderBy(subjects.name, papers.paperType, papers.year, papers.title);

  const matched = rows.filter((row) => row.medium === (row.subjectFixedMedium ?? studentMedium));
  if (matched.length === 0) return [];

  const paperIds = matched.map((r) => r.id);

  const mcqCounts = await db
    .select({ paperId: mcqs.paperId, count: count() })
    .from(mcqs)
    .where(and(inArray(mcqs.paperId, paperIds), eq(mcqs.status, "published")))
    .groupBy(mcqs.paperId);
  const questionCountByPaper = new Map(mcqCounts.map((row) => [row.paperId as string, Number(row.count)]));

  const { statusByPaper, answeredCountByPaper } = await resolvePaperStatuses(studentId, paperIds);

  return matched.map((row) => {
    const questionCount = questionCountByPaper.get(row.id) ?? 0;
    return {
      id: row.id,
      title: row.title,
      subjectId: row.subjectId,
      subjectName: row.subjectName,
      paperType: row.paperType,
      year: row.year,
      questionCount,
      totalMarks: questionCount * MARKS_PER_QUESTION,
      timeLimitMinutes: row.timeLimitMinutes,
      status: statusByPaper.get(row.id) ?? "not_started",
      answeredCount: answeredCountByPaper.get(row.id) ?? null,
    };
  });
}

export type PaperOverview = {
  id: string;
  title: string;
  subjectId: string;
  subjectName: string;
  grade: "10" | "11";
  paperType: PaperTypeValue;
  year: number | null;
  questionCount: number;
  totalMarks: number;
  timeLimitMinutes: number | null;
  status: PaperAttemptStatus;
  answeredCount: number | null;
};

// Read-only overview for /papers/[paperId] — deliberately never calls
// ensurePaperAttemptStarted (that's the quiz-taking route's own job); this
// only reads whatever attempt state already exists, so viewing the overview
// itself never marks a paper "in progress".
export async function getPaperOverview(params: {
  paperId: string;
  studentId: string;
}): Promise<PaperOverview | null> {
  const { paperId, studentId } = params;

  const rows = await db
    .select({
      id: papers.id,
      title: papers.title,
      subjectId: papers.subjectId,
      subjectName: subjects.name,
      grade: papers.grade,
      paperType: papers.paperType,
      year: papers.year,
      timeLimitMinutes: papers.timeLimitMinutes,
    })
    .from(papers)
    .innerJoin(subjects, eq(papers.subjectId, subjects.id))
    .where(eq(papers.id, paperId));
  const row = rows[0];
  if (!row) return null;

  const [{ questionCount }] = await db
    .select({ questionCount: count() })
    .from(mcqs)
    .where(and(eq(mcqs.paperId, paperId), eq(mcqs.status, "published")));

  const { statusByPaper, answeredCountByPaper } = await resolvePaperStatuses(studentId, [paperId]);

  return {
    id: row.id,
    title: row.title,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    grade: row.grade,
    paperType: row.paperType,
    year: row.year,
    questionCount: Number(questionCount),
    totalMarks: Number(questionCount) * MARKS_PER_QUESTION,
    timeLimitMinutes: row.timeLimitMinutes,
    status: statusByPaper.get(paperId) ?? "not_started",
    answeredCount: answeredCountByPaper.get(paperId) ?? null,
  };
}
