import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { mcqs, modules, subjects, subTopics } from "@/db/schema";
import { moduleGradesForQuery } from "@/lib/reference-data";

export type AdminSubject = { id: string; name: string };

export async function getSubjectsForAdmin(): Promise<AdminSubject[]> {
  return db.select({ id: subjects.id, name: subjects.name }).from(subjects).orderBy(subjects.name);
}

export type AdminSubTopic = {
  id: string;
  name: string;
  sortOrder: number;
  // Published or draft, any mcq tagged with this sub-topic — the count the
  // delete-warning confirmation shows, since deleting a sub-topic cascades
  // to delete every one of them (see mcqs.sub_topic_id's onDelete: cascade
  // in schema.ts).
  questionCount: number;
};

export type AdminTopic = {
  id: string;
  name: string;
  sortOrder: number;
  // Sum of every child sub-topic's questionCount — the delete-warning count
  // for the topic (module) itself, since deleting it cascades through its
  // sub-topics to their questions too.
  questionCount: number;
  subTopics: AdminSubTopic[];
};

// Everything the /admin/topics page needs for one subject+grade in a single
// round-trip-per-concern: the topic (module) list in syllabus order, each
// with its sub-topics (also in order) and a live question count per
// sub-topic — used both for display and for the delete-confirmation
// warning, not derived from any cached count.
//
// `grade` may be "gcse" (see moduleGradesForQuery) — there's no GCSE-owned
// taxonomy, so this returns the union of Grade 10's and Grade 11's own
// modules, grouped by grade then syllabus sortOrder within each (not
// interleaved by sortOrder alone, which would produce a meaningless order
// across two different syllabuses). An ordinary "10"/"11" request is
// unaffected — moduleGradesForQuery returns a single-element list, and the
// grade sort key is then constant and a no-op.
export async function getTopicsForSubjectGrade(subjectId: string, grade: string): Promise<AdminTopic[]> {
  const moduleRows = await db.query.modules.findMany({
    where: and(eq(modules.subjectId, subjectId), inArray(modules.grade, moduleGradesForQuery(grade))),
    orderBy: [modules.grade, modules.sortOrder],
    with: { subTopics: { orderBy: subTopics.sortOrder } },
  });

  const allSubTopicIds = moduleRows.flatMap((m) => m.subTopics.map((s) => s.id));
  const mcqCounts = allSubTopicIds.length
    ? await db
        .select({ subTopicId: mcqs.subTopicId, count: count() })
        .from(mcqs)
        .where(inArray(mcqs.subTopicId, allSubTopicIds))
        .groupBy(mcqs.subTopicId)
    : [];
  const countBySubTopic = new Map(mcqCounts.map((row) => [row.subTopicId as string, Number(row.count)]));

  return moduleRows.map((gradeModule) => {
    const subTopicsWithCounts: AdminSubTopic[] = gradeModule.subTopics.map((subTopic) => ({
      id: subTopic.id,
      name: subTopic.name,
      sortOrder: subTopic.sortOrder,
      questionCount: countBySubTopic.get(subTopic.id) ?? 0,
    }));
    return {
      id: gradeModule.id,
      name: gradeModule.name,
      sortOrder: gradeModule.sortOrder,
      questionCount: subTopicsWithCounts.reduce((sum, s) => sum + s.questionCount, 0),
      subTopics: subTopicsWithCounts,
    };
  });
}
