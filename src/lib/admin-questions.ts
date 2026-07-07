import { db } from "@/db";
import { modules, papers, subjects, subTopics } from "@/db/schema";
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
