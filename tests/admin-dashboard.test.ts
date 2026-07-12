import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { mcqs, modules, papers, quizAttempts, subjects, subTopics, users } from "@/db/schema";
import {
  getAdminContentCoverageBySubject,
  getAdminOverviewStats,
  getCoverageGaps,
  getGradesWithContent,
  getScopedKpis,
  getSubjectsWithContentForGrade,
  getUnverifiedQuestions,
} from "@/lib/admin-dashboard";
import type { AdminTopic } from "@/lib/admin-topics";
import { textOptions } from "./helpers";

describe("getAdminOverviewStats", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectId: string;
  let studentId: string;

  beforeAll(async () => {
    const [subject] = await db.insert(subjects).values({ name: `Test AdminDash Overview Subject ${runId}` }).returning();
    subjectId = subject.id;
    const [student] = await db
      .insert(users)
      .values({ authProviderId: `test-admindash-auth-${runId}`, email: `test-admindash-${runId}@example.com` })
      .returning();
    studentId = student.id;
  });

  afterAll(async () => {
    await db.delete(subjects).where(eq(subjects.id, subjectId));
    await db.delete(users).where(eq(users.id, studentId));
  });

  // These aggregates are deliberately site-wide/unscoped (that's the whole
  // point of a KPI card), so unlike every other query in this file there's
  // no subject/grade to filter the "after" read down to just our own
  // fixture. A plain before/after delta against the live shared test
  // database is genuinely flaky here — other test files run concurrently
  // and both insert AND delete (via their own afterAll cleanup) rows in
  // these same tables, so the global count can shift in either direction
  // between the two reads even under a "greater than or equal" assertion.
  // Running the whole before-insert-after sequence inside one REPEATABLE
  // READ transaction fixes this: the transaction's snapshot is taken once,
  // at its start, so concurrent commits from other connections are never
  // visible inside it — the only difference between "before" and "after"
  // is this test's own writes, giving an exact, deterministic delta.
  it("reflects newly added questions, papers, and attempts", async () => {
    await db.transaction(
      async (tx) => {
        const before = await getAdminOverviewStats(tx);

        const [paper] = await tx
          .insert(papers)
          .values({ subjectId, grade: "10", medium: "english", paperType: "school", title: `Test Overview Paper ${runId}` })
          .returning();

        await tx.insert(mcqs).values([
          { paperId: paper.id, questionText: `Overview Q1 ${runId}`, options: textOptions("A", "B"), correctOption: 0, verificationStatus: "unverified" },
          { paperId: paper.id, questionText: `Overview Q2 ${runId}`, options: textOptions("A", "B"), correctOption: 0, verificationStatus: "verified" },
        ]);

        // Two attempts for the same brand-new student — activeStudents
        // should reflect one additional distinct student, not one per
        // attempt.
        await tx.insert(quizAttempts).values({ studentId, paperId: paper.id, completedAt: new Date() });
        await tx.insert(quizAttempts).values({ studentId, paperId: paper.id, completedAt: new Date() });

        const after = await getAdminOverviewStats(tx);

        expect(after.totalQuestions - before.totalQuestions).toBe(2);
        expect(after.totalPapers - before.totalPapers).toBe(1);
        expect(after.pendingReview - before.pendingReview).toBe(1);
        expect(after.activeStudents - before.activeStudents).toBe(1);
      },
      { isolationLevel: "repeatable read" },
    );
  });
});

describe("getAdminContentCoverageBySubject", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectId: string;
  let moduleId: string;
  let subTopicId: string;
  let paperId: string;

  beforeAll(async () => {
    const [subject] = await db.insert(subjects).values({ name: `Test AdminDash Coverage Subject ${runId}` }).returning();
    subjectId = subject.id;
    const [mod] = await db.insert(modules).values({ subjectId, grade: "10", name: `Test Coverage Module ${runId}` }).returning();
    moduleId = mod.id;
    const [sub] = await db.insert(subTopics).values({ moduleId, name: `Test Coverage SubTopic ${runId}` }).returning();
    subTopicId = sub.id;
    const [paper] = await db
      .insert(papers)
      .values({ subjectId, grade: "10", medium: "english", paperType: "school", title: `Test Coverage Paper ${runId}` })
      .returning();
    paperId = paper.id;

    await db.insert(mcqs).values([
      // Reachable only via sub-topic -> module -> subject.
      { subTopicId, questionText: `Coverage Q1 ${runId}`, options: textOptions("A", "B"), correctOption: 0 },
      // Reachable only via paper -> subject.
      { paperId, questionText: `Coverage Q2 ${runId}`, options: textOptions("A", "B"), correctOption: 0 },
      // Reachable via BOTH paths at once, for the same subject — must be
      // counted exactly once, not twice.
      { paperId, subTopicId, questionText: `Coverage Q3 ${runId}`, options: textOptions("A", "B"), correctOption: 0 },
    ]);
  });

  afterAll(async () => {
    await db.delete(subjects).where(eq(subjects.id, subjectId));
  });

  it("counts each question exactly once even when reachable via both sub-topic and paper paths", async () => {
    const coverage = await getAdminContentCoverageBySubject();
    const ours = coverage.find((s) => s.subjectId === subjectId)!;
    expect(ours).toBeDefined();
    expect(ours.questionCount).toBe(3);
  });

  it("includes a subject with zero questions", async () => {
    const [emptySubject] = await db.insert(subjects).values({ name: `Test AdminDash Empty Subject ${runId}` }).returning();
    try {
      const coverage = await getAdminContentCoverageBySubject();
      const ours = coverage.find((s) => s.subjectId === emptySubject.id)!;
      expect(ours).toBeDefined();
      expect(ours.questionCount).toBe(0);
    } finally {
      await db.delete(subjects).where(eq(subjects.id, emptySubject.id));
    }
  });
});

describe("getGradesWithContent / getSubjectsWithContentForGrade", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectId: string;

  beforeAll(async () => {
    const [subject] = await db.insert(subjects).values({ name: `Test AdminDash Grades Subject ${runId}` }).returning();
    subjectId = subject.id;
    // Grade 11 only — grade 10 should never see this subject.
    await db.insert(modules).values({ subjectId, grade: "11", name: `Test Grades Module ${runId}` });
  });

  afterAll(async () => {
    await db.delete(subjects).where(eq(subjects.id, subjectId));
  });

  it("getGradesWithContent includes grade 11 (has a module)", async () => {
    const grades = await getGradesWithContent();
    expect(grades).toContain("11");
  });

  it("getSubjectsWithContentForGrade returns the subject for grade 11 but not grade 10", async () => {
    const grade11Subjects = await getSubjectsWithContentForGrade("11");
    expect(grade11Subjects.some((s) => s.id === subjectId)).toBe(true);

    const grade10Subjects = await getSubjectsWithContentForGrade("10");
    expect(grade10Subjects.some((s) => s.id === subjectId)).toBe(false);
  });
});

describe("getScopedKpis", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectId: string;

  const topics: AdminTopic[] = [
    {
      id: "topic-1",
      name: "Topic 1",
      sortOrder: 0,
      questionCount: 5,
      subTopics: [
        { id: "sub-1a", name: "Sub 1a", sortOrder: 0, questionCount: 5 },
        { id: "sub-1b", name: "Sub 1b", sortOrder: 1, questionCount: 0 },
      ],
    },
    {
      id: "topic-2",
      name: "Topic 2",
      sortOrder: 1,
      questionCount: 0,
      subTopics: [{ id: "sub-2a", name: "Sub 2a", sortOrder: 0, questionCount: 0 }],
    },
  ];

  beforeAll(async () => {
    const [subject] = await db.insert(subjects).values({ name: `Test AdminDash Kpis Subject ${runId}` }).returning();
    subjectId = subject.id;
    await db.insert(papers).values([
      { subjectId, grade: "10", medium: "english", paperType: "school", title: `Kpis Paper Draft ${runId}`, status: "draft" },
      { subjectId, grade: "10", medium: "english", paperType: "school", title: `Kpis Paper Published ${runId}`, status: "published" },
      // Different grade — must not be counted.
      { subjectId, grade: "11", medium: "english", paperType: "school", title: `Kpis Paper Grade11 ${runId}` },
    ]);
  });

  afterAll(async () => {
    await db.delete(subjects).where(eq(subjects.id, subjectId));
  });

  it("derives totals from the given topic tree and counts papers regardless of status", async () => {
    const kpis = await getScopedKpis(subjectId, "10", topics);
    expect(kpis.totalQuestions).toBe(5);
    expect(kpis.topicsCoveredCount).toBe(1);
    expect(kpis.topicsTotalCount).toBe(2);
    expect(kpis.emptySubTopicCount).toBe(2);
    // Both grade-10 papers count (draft and published); the grade-11 one doesn't.
    expect(kpis.papersUsingSubject).toBe(2);
  });
});

describe("getCoverageGaps", () => {
  it("returns only zero-question sub-topics, each tagged with its parent topic's name", () => {
    const topics: AdminTopic[] = [
      {
        id: "t1",
        name: "Topic One",
        sortOrder: 0,
        questionCount: 3,
        subTopics: [
          { id: "s1", name: "Weak Sub", sortOrder: 0, questionCount: 0 },
          { id: "s2", name: "Strong Sub", sortOrder: 1, questionCount: 3 },
        ],
      },
      {
        id: "t2",
        name: "Topic Two",
        sortOrder: 1,
        questionCount: 0,
        subTopics: [{ id: "s3", name: "Also Weak", sortOrder: 0, questionCount: 0 }],
      },
    ];

    const gaps = getCoverageGaps(topics);
    expect(gaps).toEqual([
      { subTopicId: "s1", subTopicName: "Weak Sub", topicId: "t1", topicName: "Topic One" },
      { subTopicId: "s3", subTopicName: "Also Weak", topicId: "t2", topicName: "Topic Two" },
    ]);
  });

  it("returns an empty array when every sub-topic has at least one question", () => {
    const topics: AdminTopic[] = [
      {
        id: "t1",
        name: "Topic One",
        sortOrder: 0,
        questionCount: 3,
        subTopics: [{ id: "s1", name: "Sub", sortOrder: 0, questionCount: 3 }],
      },
    ];
    expect(getCoverageGaps(topics)).toEqual([]);
  });
});

describe("getUnverifiedQuestions", () => {
  const runId = randomUUID().slice(0, 8);
  let subjectId: string;
  let moduleId: string;
  let subTopicId: string;
  let paperId: string;
  let paperQuestionId: string;
  let standaloneQuestionId: string;
  let verifiedQuestionId: string;

  beforeAll(async () => {
    const [subject] = await db.insert(subjects).values({ name: `Test AdminDash Unverified Subject ${runId}` }).returning();
    subjectId = subject.id;
    const [mod] = await db.insert(modules).values({ subjectId, grade: "10", name: `Test Unverified Module ${runId}` }).returning();
    moduleId = mod.id;
    const [sub] = await db.insert(subTopics).values({ moduleId, name: `Test Unverified SubTopic ${runId}` }).returning();
    subTopicId = sub.id;
    const [paper] = await db
      .insert(papers)
      .values({ subjectId, grade: "10", medium: "english", paperType: "school", title: `Test Unverified Paper ${runId}` })
      .returning();
    paperId = paper.id;

    const [paperQuestion] = await db
      .insert(mcqs)
      .values({
        paperId,
        questionText: `Unverified Paper Q ${runId}`,
        options: textOptions("A", "B"),
        correctOption: 0,
        verificationStatus: "unverified",
      })
      .returning();
    paperQuestionId = paperQuestion.id;

    const [standaloneQuestion] = await db
      .insert(mcqs)
      .values({
        subTopicId,
        questionText: `Unverified Standalone Q ${runId}`,
        options: textOptions("A", "B"),
        correctOption: 0,
        verificationStatus: "unverified",
      })
      .returning();
    standaloneQuestionId = standaloneQuestion.id;

    const [verifiedQuestion] = await db
      .insert(mcqs)
      .values({
        paperId,
        questionText: `Verified Q ${runId}`,
        options: textOptions("A", "B"),
        correctOption: 0,
        verificationStatus: "verified",
      })
      .returning();
    verifiedQuestionId = verifiedQuestion.id;
  });

  afterAll(async () => {
    await db.delete(subjects).where(eq(subjects.id, subjectId));
    await pool.end();
  });

  it("resolves subject/grade via the paper path for a paper-attached question", async () => {
    const questions = await getUnverifiedQuestions();
    const q = questions.find((r) => r.id === paperQuestionId)!;
    expect(q).toBeDefined();
    expect(q.paperId).toBe(paperId);
    expect(q.paperTitle).toBe(`Test Unverified Paper ${runId}`);
    expect(q.subjectName).toBe(`Test AdminDash Unverified Subject ${runId}`);
    expect(q.grade).toBe("10");
  });

  it("resolves subject/grade via the sub-topic/module path for a standalone question", async () => {
    const questions = await getUnverifiedQuestions();
    const q = questions.find((r) => r.id === standaloneQuestionId)!;
    expect(q).toBeDefined();
    expect(q.paperId).toBeNull();
    expect(q.paperTitle).toBeNull();
    expect(q.subjectName).toBe(`Test AdminDash Unverified Subject ${runId}`);
    expect(q.grade).toBe("10");
  });

  it("never includes an already-verified question", async () => {
    const questions = await getUnverifiedQuestions();
    expect(questions.some((r) => r.id === verifiedQuestionId)).toBe(false);
  });
});
