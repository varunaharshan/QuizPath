import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { mcqs, modules, papers, subjects, subTopics } from "@/db/schema";
import {
  getAdjacentQuestionIds,
  getPaperForQuestionsAdmin,
  getQuestionForEdit,
  getQuestionsForPaper,
} from "@/lib/admin-questions";
import { textOptions } from "./helpers";

// Pure function, no DB — backs the question edit page's Prev/Next toolbar.
describe("getAdjacentQuestionIds", () => {
  const questions = [{ id: "q1" }, { id: "q2" }, { id: "q3" }];

  it("returns null prevId and the next question's id for the first question", () => {
    expect(getAdjacentQuestionIds(questions, "q1")).toEqual({
      position: 1,
      total: 3,
      prevId: null,
      nextId: "q2",
    });
  });

  it("returns both prevId and nextId for a middle question", () => {
    expect(getAdjacentQuestionIds(questions, "q2")).toEqual({
      position: 2,
      total: 3,
      prevId: "q1",
      nextId: "q3",
    });
  });

  it("returns null nextId for the last question", () => {
    expect(getAdjacentQuestionIds(questions, "q3")).toEqual({
      position: 3,
      total: 3,
      prevId: "q2",
      nextId: null,
    });
  });

  it("returns position 0 and both ids null for an id not in the list", () => {
    expect(getAdjacentQuestionIds(questions, "unknown")).toEqual({
      position: 0,
      total: 3,
      prevId: null,
      nextId: null,
    });
  });

  it("handles a single-question paper: both prev and next are null", () => {
    expect(getAdjacentQuestionIds([{ id: "only" }], "only")).toEqual({
      position: 1,
      total: 1,
      prevId: null,
      nextId: null,
    });
  });
});

describe("admin-questions: paper question review/management", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectId: string;
  let moduleId: string;
  let subTopicId: string;
  let paperId: string;
  let taggedQuestionId: string;
  let untaggedQuestionId: string;

  beforeAll(async () => {
    const [subject] = await db.insert(subjects).values({ name: `Test AdminQuestions Subject ${runId}` }).returning();
    subjectId = subject.id;
    const [mod] = await db
      .insert(modules)
      .values({ subjectId, grade: "10", name: `Test AdminQuestions Module ${runId}` })
      .returning();
    moduleId = mod.id;
    const [sub] = await db
      .insert(subTopics)
      .values({ moduleId, name: `Test AdminQuestions SubTopic ${runId}` })
      .returning();
    subTopicId = sub.id;

    const [paper] = await db
      .insert(papers)
      .values({
        subjectId,
        grade: "10",
        medium: "english",
        paperType: "provincial",
        title: `Test AdminQuestions Paper ${runId}`,
      })
      .returning();
    paperId = paper.id;

    const [taggedQuestion] = await db
      .insert(mcqs)
      .values({
        paperId,
        subTopicId,
        questionText: `Tagged question ${runId}`,
        questionImage: { type: "image", content: "https://example.com/q.png" },
        options: textOptions("A", "B", "C", "D"),
        correctOption: 2,
        difficulty: "hard",
        keywords: ["alpha", "beta"],
        hint: "Think about the cell's energy production",
        verificationStatus: "unverified",
      })
      .returning();
    taggedQuestionId = taggedQuestion.id;

    const [untaggedQuestion] = await db
      .insert(mcqs)
      .values({
        paperId,
        questionText: `Untagged question ${runId}`,
        options: textOptions("W", "X"),
        correctOption: 0,
        status: "published",
      })
      .returning();
    untaggedQuestionId = untaggedQuestion.id;

    // A question belonging to a different paper — must never leak in.
    const [otherPaper] = await db
      .insert(papers)
      .values({
        subjectId,
        grade: "10",
        medium: "english",
        paperType: "district",
        title: `Test AdminQuestions Other Paper ${runId}`,
      })
      .returning();
    await db.insert(mcqs).values({
      paperId: otherPaper.id,
      questionText: `Other paper question ${runId}`,
      options: textOptions("Y", "Z"),
      correctOption: 0,
    });
  });

  afterAll(async () => {
    await db.delete(subjects).where(eq(subjects.id, subjectId));
    await pool.end();
  });

  it("getPaperForQuestionsAdmin returns paper + subject name, or null if not found", async () => {
    const paper = await getPaperForQuestionsAdmin(paperId);
    expect(paper).toMatchObject({
      id: paperId,
      title: `Test AdminQuestions Paper ${runId}`,
      grade: "10",
      subjectId,
      subjectName: `Test AdminQuestions Subject ${runId}`,
    });

    expect(await getPaperForQuestionsAdmin(randomUUID())).toBeNull();
  });

  it("getQuestionsForPaper returns only this paper's questions, with topic/sub-topic names resolved", async () => {
    const questions = await getQuestionsForPaper(paperId);
    expect(questions.map((q) => q.id).sort()).toEqual([taggedQuestionId, untaggedQuestionId].sort());

    const tagged = questions.find((q) => q.id === taggedQuestionId)!;
    expect(tagged.subTopicName).toBe(`Test AdminQuestions SubTopic ${runId}`);
    expect(tagged.moduleName).toBe(`Test AdminQuestions Module ${runId}`);
    expect(tagged.questionImage).toEqual({ type: "image", content: "https://example.com/q.png" });
    expect(tagged.verificationStatus).toBe("unverified");
    expect(tagged.keywords).toEqual(["alpha", "beta"]);
    expect(tagged.hint).toBe("Think about the cell's energy production");
    // Never set explicitly on this fixture — must reflect the schema's own
    // "draft" default, the same state every Bulk Upload import lands in.
    expect(tagged.status).toBe("draft");

    const untagged = questions.find((q) => q.id === untaggedQuestionId)!;
    expect(untagged.subTopicName).toBeNull();
    expect(untagged.moduleName).toBeNull();
    expect(untagged.subTopicId).toBeNull();
    // No hint was set on this fixture — must come through as null, not "".
    expect(untagged.hint).toBeNull();
    expect(untagged.status).toBe("published");
  });

  it("getQuestionForEdit returns full detail including paperId, or null if not found", async () => {
    const detail = await getQuestionForEdit(taggedQuestionId);
    expect(detail).toMatchObject({
      id: taggedQuestionId,
      paperId,
      subTopicId,
      moduleId,
      difficulty: "hard",
      correctOption: 2,
      hint: "Think about the cell's energy production",
      status: "draft",
    });

    expect(await getQuestionForEdit(randomUUID())).toBeNull();
  });
});
