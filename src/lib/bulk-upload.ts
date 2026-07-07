import Papa from "papaparse";

// Deliberately zero import of @/db (or anything that transitively imports
// it) anywhere in this file — the same "Client Components can't import
// server-only-guarded code" constraint documented for
// src/lib/keyword-tag-input-logic.ts and topic-card-grid.tsx's own
// comments. <BulkUploadForm> (a "use client" component) imports
// parseBulkCsv/validateBulkRows/generateTemplateCsv straight from here so
// the whole parse-and-validate step never leaves the browser; only the
// final resolved, already-valid rows are ever sent to the server (see
// src/app/admin/questions/bulk-upload/actions.ts).

export const TEMPLATE_HEADERS = [
  "Question Text",
  "Option A",
  "Option B",
  "Option C",
  "Option D",
  "Correct Answer",
  "Subject",
  "Grade",
  "Topic",
  "Sub-topic",
  "Difficulty",
  "Keywords",
  "Paper Reference",
] as const;

export function generateTemplateCsv(): string {
  return Papa.unparse({ fields: [...TEMPLATE_HEADERS], data: [] });
}

export type BulkUploadRow = {
  // 1-based index among data rows only (the header line is never counted),
  // matching how the review grid displays "Row 1, Row 2, …".
  rowNumber: number;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
  subject: string;
  grade: string;
  topic: string;
  subTopic: string;
  difficulty: string;
  keywords: string;
  paperReference: string;
};

const HEADER_KEY_MAP: Record<string, keyof Omit<BulkUploadRow, "rowNumber">> = {
  "question text": "questionText",
  "option a": "optionA",
  "option b": "optionB",
  "option c": "optionC",
  "option d": "optionD",
  "correct answer": "correctAnswer",
  subject: "subject",
  grade: "grade",
  topic: "topic",
  "sub-topic": "subTopic",
  "sub topic": "subTopic",
  subtopic: "subTopic",
  difficulty: "difficulty",
  keywords: "keywords",
  "paper reference": "paperReference",
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, " ");
}

// Header matching is deliberately tolerant of whitespace/case (and a couple
// of "sub-topic" spelling variants) rather than requiring an exact string
// match against TEMPLATE_HEADERS — content staff hand-editing a downloaded
// template in a spreadsheet app can easily introduce trivial differences
// that shouldn't fail the whole file.
export function parseBulkCsv(csvText: string): BulkUploadRow[] {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  return parsed.data.map((rawRow, index) => {
    const row: Partial<Record<keyof Omit<BulkUploadRow, "rowNumber">, string>> = {};
    for (const [rawHeader, value] of Object.entries(rawRow)) {
      const key = HEADER_KEY_MAP[normalizeHeader(rawHeader)];
      if (key) row[key] = (value ?? "").trim();
    }
    return {
      rowNumber: index + 1,
      questionText: row.questionText ?? "",
      optionA: row.optionA ?? "",
      optionB: row.optionB ?? "",
      optionC: row.optionC ?? "",
      optionD: row.optionD ?? "",
      correctAnswer: row.correctAnswer ?? "",
      subject: row.subject ?? "",
      grade: row.grade ?? "",
      topic: row.topic ?? "",
      subTopic: row.subTopic ?? "",
      difficulty: row.difficulty ?? "",
      keywords: row.keywords ?? "",
      paperReference: row.paperReference ?? "",
    };
  });
}

// Every subject/module/sub-topic/paper in the app — small enough to load
// once per bulk-upload page visit (same "low hundreds, full load is fine"
// reasoning as getKeywordSuggestions), rather than a per-row DB lookup
// during validation.
export type BulkUploadReferenceData = {
  subjects: { id: string; name: string }[];
  modules: { id: string; name: string; subjectId: string; grade: "10" | "11" }[];
  subTopics: { id: string; name: string; moduleId: string }[];
  papers: { id: string; title: string; subjectId: string; grade: "10" | "11" }[];
};

export type ResolvedBulkRow = {
  subTopicId: string;
  paperId: string | null;
  questionText: string;
  options: [string, string, string, string];
  correctOption: number;
  difficulty: "easy" | "medium" | "hard";
  keywords: string[];
};

export type ValidatedBulkRow = {
  row: BulkUploadRow;
  errors: string[];
  // Non-null iff errors.length === 0 — every field needed to insert the mcq
  // has already been resolved to a real id, so the import step never has to
  // re-derive anything, just insert.
  resolved: ResolvedBulkRow | null;
};

function norm(value: string): string {
  return value.trim().toLowerCase();
}

function isGradeValue(value: string): value is "10" | "11" {
  return value === "10" || value === "11";
}

function isDifficultyValue(value: string): value is "easy" | "medium" | "hard" {
  return value === "easy" || value === "medium" || value === "hard";
}

export function validateBulkRow(row: BulkUploadRow, ref: BulkUploadReferenceData): ValidatedBulkRow {
  const errors: string[] = [];

  const required: [string, string][] = [
    ["Question text", row.questionText],
    ["Option A", row.optionA],
    ["Option B", row.optionB],
    ["Option C", row.optionC],
    ["Option D", row.optionD],
    ["Correct answer", row.correctAnswer],
    ["Subject", row.subject],
    ["Grade", row.grade],
    ["Topic", row.topic],
    ["Sub-topic", row.subTopic],
    ["Difficulty", row.difficulty],
  ];
  for (const [label, value] of required) {
    if (!value.trim()) errors.push(`${label} is required`);
  }

  const gradeRaw = row.grade.trim();
  const gradeIsValid = isGradeValue(gradeRaw);
  if (gradeRaw && !gradeIsValid) {
    errors.push(`Invalid grade "${row.grade}" (must be 10 or 11)`);
  }

  const difficultyRaw = norm(row.difficulty);
  if (row.difficulty.trim() && !isDifficultyValue(difficultyRaw)) {
    errors.push(`Invalid difficulty "${row.difficulty}" (must be easy, medium, or hard)`);
  }

  const options = [row.optionA, row.optionB, row.optionC, row.optionD];
  const correctIndex = options.findIndex((opt) => opt.trim() && norm(opt) === norm(row.correctAnswer));
  if (row.correctAnswer.trim() && correctIndex === -1) {
    errors.push(`Correct answer "${row.correctAnswer}" doesn't match any option`);
  }

  const subject = row.subject.trim() ? ref.subjects.find((s) => norm(s.name) === norm(row.subject)) : undefined;
  if (row.subject.trim() && !subject) {
    errors.push(`Subject "${row.subject}" not found`);
  }

  let matchedModule: BulkUploadReferenceData["modules"][number] | undefined;
  if (subject && gradeIsValid && row.topic.trim()) {
    matchedModule = ref.modules.find(
      (m) => m.subjectId === subject.id && m.grade === gradeRaw && norm(m.name) === norm(row.topic),
    );
    if (!matchedModule) {
      errors.push(`Topic "${row.topic}" not found for ${subject.name} Grade ${gradeRaw}`);
    }
  }

  let matchedSubTopic: BulkUploadReferenceData["subTopics"][number] | undefined;
  if (matchedModule && row.subTopic.trim()) {
    matchedSubTopic = ref.subTopics.find(
      (s) => s.moduleId === matchedModule!.id && norm(s.name) === norm(row.subTopic),
    );
    if (!matchedSubTopic) {
      errors.push(`Sub-topic "${row.subTopic}" not found under "${row.topic}"`);
    }
  }

  let matchedPaper: BulkUploadReferenceData["papers"][number] | undefined;
  if (row.paperReference.trim() && subject && gradeIsValid) {
    matchedPaper = ref.papers.find(
      (p) => p.subjectId === subject.id && p.grade === gradeRaw && norm(p.title) === norm(row.paperReference),
    );
    if (!matchedPaper) {
      errors.push(`Paper reference "${row.paperReference}" not found`);
    }
  }

  if (errors.length > 0 || !matchedSubTopic || !isDifficultyValue(difficultyRaw)) {
    return { row, errors, resolved: null };
  }

  return {
    row,
    errors: [],
    resolved: {
      subTopicId: matchedSubTopic.id,
      paperId: matchedPaper?.id ?? null,
      questionText: row.questionText.trim(),
      options: [row.optionA.trim(), row.optionB.trim(), row.optionC.trim(), row.optionD.trim()],
      correctOption: correctIndex,
      difficulty: difficultyRaw,
      keywords: row.keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
    },
  };
}

export function validateBulkRows(rows: BulkUploadRow[], ref: BulkUploadReferenceData): ValidatedBulkRow[] {
  return rows.map((row) => validateBulkRow(row, ref));
}
