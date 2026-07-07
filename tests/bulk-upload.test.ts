import { describe, expect, it } from "vitest";
import {
  generateTemplateCsv,
  parseBulkCsv,
  TEMPLATE_HEADERS,
  validateBulkRow,
  validateBulkRows,
  type BulkUploadReferenceData,
  type BulkUploadRow,
} from "@/lib/bulk-upload";

const REF: BulkUploadReferenceData = {
  subjects: [{ id: "subj-science", name: "Science" }],
  modules: [
    { id: "mod-chem", name: "Chemical Reactions", subjectId: "subj-science", grade: "10" },
    { id: "mod-chem-11", name: "Chemical Reactions", subjectId: "subj-science", grade: "11" },
  ],
  subTopics: [
    { id: "sub-types", name: "Types of Chemical Reactions", moduleId: "mod-chem" },
    { id: "sub-types-11", name: "Types of Chemical Reactions", moduleId: "mod-chem-11" },
  ],
  papers: [{ id: "paper-2023", title: "2023 Paper 1", subjectId: "subj-science", grade: "10" }],
};

function validRow(overrides: Partial<BulkUploadRow> = {}): BulkUploadRow {
  return {
    rowNumber: 1,
    questionText: "What is the powerhouse of the cell?",
    optionA: "Nucleus",
    optionB: "Mitochondria",
    optionC: "Ribosome",
    optionD: "Golgi body",
    correctAnswer: "2", // position 2 = Option B = "Mitochondria"
    subject: "Science",
    grade: "10",
    topic: "Chemical Reactions",
    subTopic: "Types of Chemical Reactions",
    difficulty: "medium",
    keywords: "Cell Biology, Mitochondria",
    paperReference: "",
    ...overrides,
  };
}

describe("generateTemplateCsv", () => {
  it("produces exactly the documented header columns, in order", () => {
    const csv = generateTemplateCsv();
    const headerLine = csv.split(/\r?\n/)[0];
    expect(headerLine.split(",")).toEqual([...TEMPLATE_HEADERS]);
  });
});

describe("parseBulkCsv", () => {
  it("parses a well-formed CSV into rows, numbered from 1 excluding the header", () => {
    const csv = [
      "Question Text,Option A,Option B,Option C,Option D,Correct Answer,Subject,Grade,Topic,Sub-topic,Difficulty,Keywords,Paper Reference",
      'What causes rust?,Oxygen,Nitrogen,Hydrogen,Carbon,Oxygen,Science,10,Chemical Reactions,Types of Chemical Reactions,easy,"Rust, Oxidation",',
    ].join("\n");

    const rows = parseBulkCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].rowNumber).toBe(1);
    expect(rows[0].questionText).toBe("What causes rust?");
    expect(rows[0].keywords).toBe("Rust, Oxidation");
  });

  it("matches headers case-insensitively and tolerates 'sub topic'/'subtopic' spelling variants", () => {
    const csv = [
      "question text,option a,option b,option c,option d,correct answer,subject,grade,topic,subtopic,difficulty,keywords,paper reference",
      "Q,A,B,C,D,A,Science,10,Chemical Reactions,Types of Chemical Reactions,easy,,",
    ].join("\n");

    const rows = parseBulkCsv(csv);
    expect(rows[0].subTopic).toBe("Types of Chemical Reactions");
  });

  it("returns an empty array for a file with only a header row", () => {
    const csv = "Question Text,Option A,Option B,Option C,Option D,Correct Answer,Subject,Grade,Topic,Sub-topic,Difficulty,Keywords,Paper Reference";
    expect(parseBulkCsv(csv)).toEqual([]);
  });
});

describe("validateBulkRow", () => {
  it("resolves a fully valid row to real ids with no errors", () => {
    const result = validateBulkRow(validRow(), REF);
    expect(result.errors).toEqual([]);
    expect(result.resolved).toEqual({
      subTopicId: "sub-types",
      paperId: null,
      questionText: "What is the powerhouse of the cell?",
      options: [
        { type: "text", content: "Nucleus" },
        { type: "text", content: "Mitochondria" },
        { type: "text", content: "Ribosome" },
        { type: "text", content: "Golgi body" },
      ],
      correctOption: 1,
      difficulty: "medium",
      keywords: ["Cell Biology", "Mitochondria"],
    });
  });

  it("flags every missing required field", () => {
    const result = validateBulkRow(validRow({ questionText: "", subject: "" }), REF);
    expect(result.resolved).toBeNull();
    expect(result.errors).toContain("Question text is required");
    expect(result.errors).toContain("Subject is required");
  });

  it("resolves a position of 1, 3, or 4 to the matching option index", () => {
    expect(validateBulkRow(validRow({ correctAnswer: "1" }), REF).resolved?.correctOption).toBe(0);
    expect(validateBulkRow(validRow({ correctAnswer: "3" }), REF).resolved?.correctOption).toBe(2);
    expect(validateBulkRow(validRow({ correctAnswer: "4" }), REF).resolved?.correctOption).toBe(3);
  });

  it("rejects a letter (A-D) as the correct answer, with the exact required-format message", () => {
    const result = validateBulkRow(validRow({ correctAnswer: "C" }), REF);
    expect(result.resolved).toBeNull();
    expect(result.errors).toContain(`Correct answer must be 1-4 (position), got 'C'`);
  });

  it("rejects the option's literal text as the correct answer (position-only, no text match)", () => {
    const result = validateBulkRow(validRow({ correctAnswer: "Mitochondria" }), REF);
    expect(result.resolved).toBeNull();
    expect(result.errors).toContain(`Correct answer must be 1-4 (position), got 'Mitochondria'`);
  });

  it("rejects an out-of-range position", () => {
    expect(validateBulkRow(validRow({ correctAnswer: "0" }), REF).errors).toContain(
      `Correct answer must be 1-4 (position), got '0'`,
    );
    expect(validateBulkRow(validRow({ correctAnswer: "5" }), REF).errors).toContain(
      `Correct answer must be 1-4 (position), got '5'`,
    );
  });

  it("flags an unknown subject", () => {
    const result = validateBulkRow(validRow({ subject: "Business Studies" }), REF);
    expect(result.resolved).toBeNull();
    expect(result.errors).toContain(`Subject "Business Studies" not found`);
  });

  it("flags an invalid grade", () => {
    const result = validateBulkRow(validRow({ grade: "12" }), REF);
    expect(result.resolved).toBeNull();
    expect(result.errors).toContain(`Invalid grade "12" (must be 10 or 11)`);
  });

  it("flags an unknown topic name", () => {
    const result = validateBulkRow(validRow({ topic: "Nonexistent Topic" }), REF);
    expect(result.resolved).toBeNull();
    expect(result.errors).toContain(`Topic "Nonexistent Topic" not found for Science Grade 10`);
  });

  it("resolves the matching grade's own module even though the same topic name exists under both grades", () => {
    // The fixture deliberately has "Chemical Reactions" as two distinct
    // modules — one per grade — with an identically-named sub-topic under
    // each, so a naive name-only match (ignoring grade) could silently
    // resolve to the wrong grade's module/sub-topic id.
    const grade10 = validateBulkRow(validRow({ grade: "10" }), REF);
    expect(grade10.resolved?.subTopicId).toBe("sub-types");

    const grade11 = validateBulkRow(validRow({ grade: "11" }), REF);
    expect(grade11.resolved?.subTopicId).toBe("sub-types-11");
  });

  it("flags a sub-topic that doesn't belong to the matched topic", () => {
    const result = validateBulkRow(validRow({ subTopic: "Balancing Equations" }), REF);
    expect(result.resolved).toBeNull();
    expect(result.errors).toContain(`Sub-topic "Balancing Equations" not found under "Chemical Reactions"`);
  });

  it("flags an invalid difficulty", () => {
    const result = validateBulkRow(validRow({ difficulty: "impossible" }), REF);
    expect(result.resolved).toBeNull();
    expect(result.errors).toContain(`Invalid difficulty "impossible" (must be easy, medium, or hard)`);
  });

  it("resolves an empty paper reference to a null paperId", () => {
    const result = validateBulkRow(validRow({ paperReference: "" }), REF);
    expect(result.resolved?.paperId).toBeNull();
  });

  it("resolves a matching paper reference to its id", () => {
    const result = validateBulkRow(validRow({ paperReference: "2023 Paper 1" }), REF);
    expect(result.errors).toEqual([]);
    expect(result.resolved?.paperId).toBe("paper-2023");
  });

  it("flags a paper reference that doesn't match any paper for that subject+grade", () => {
    const result = validateBulkRow(validRow({ paperReference: "1999 Paper 9" }), REF);
    expect(result.resolved).toBeNull();
    expect(result.errors).toContain(`Paper reference "1999 Paper 9" not found`);
  });

  it("splits, trims, and drops empty entries from the comma-separated keywords list", () => {
    const result = validateBulkRow(validRow({ keywords: " Photosynthesis ,, Light Reaction ," }), REF);
    expect(result.resolved?.keywords).toEqual(["Photosynthesis", "Light Reaction"]);
  });

  it("matches subject/topic/sub-topic names case-insensitively", () => {
    const result = validateBulkRow(
      validRow({ subject: "SCIENCE", topic: "chemical reactions", subTopic: "types of chemical reactions" }),
      REF,
    );
    expect(result.errors).toEqual([]);
    expect(result.resolved?.subTopicId).toBe("sub-types");
  });

  it("reports multiple simultaneous errors on one row", () => {
    const result = validateBulkRow(validRow({ subject: "Unknown", difficulty: "extreme" }), REF);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe("validateBulkRows", () => {
  it("validates a mixed batch, preserving row order and individual results", () => {
    const results = validateBulkRows(
      [validRow({ rowNumber: 1 }), validRow({ rowNumber: 2, subject: "Unknown" })],
      REF,
    );
    expect(results).toHaveLength(2);
    expect(results[0].errors).toEqual([]);
    expect(results[1].errors.length).toBeGreaterThan(0);
  });
});
