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
  "Question Image URL",
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
  "Hint",
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
  // Optional — the question stem's own diagram/figure. There's no
  // per-option equivalent: options are always plain text.
  questionImageUrl: string;
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
  hint: string;
  paperReference: string;
};

const HEADER_KEY_MAP: Record<string, keyof Omit<BulkUploadRow, "rowNumber">> = {
  "question text": "questionText",
  "question image url": "questionImageUrl",
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
  hint: "hint",
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
      questionImageUrl: row.questionImageUrl ?? "",
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
      hint: row.hint ?? "",
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

// Duplicated from src/db/schema.ts's QuestionOption/QuestionImage rather than
// imported — keeps this file's "zero import from @/db or anything that
// transitively imports it" invariant explicit and self-contained (see
// file-level comment above), even though schema.ts itself doesn't currently
// import @/db.
export type QuestionOption = { type: "text"; content: string };
export type QuestionImage = { type: "image"; content: string };

export type ResolvedBulkRow = {
  subTopicId: string;
  paperId: string | null;
  questionText: string;
  questionImage: QuestionImage | null;
  options: [QuestionOption, QuestionOption, QuestionOption, QuestionOption];
  correctOption: number;
  difficulty: "easy" | "medium" | "hard";
  keywords: string[];
  // Optional — null (not an empty string) when the CSV's Hint column is
  // blank, matching how questionImage is null rather than an empty object.
  hint: string | null;
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

// Format-only — confirms the string parses as a URL, not that it actually
// resolves to a reachable resource. A genuine reachability check would need
// a server round-trip (browsers can't reliably read cross-origin fetch
// results for arbitrary image hosts) and would turn this into a live
// outbound request to an admin-supplied URL on every review; deliberately
// out of scope for this pass. Exported for reuse by the per-question admin
// edit form's own server-side validation (src/app/admin/papers/[paperId]/
// questions/actions.ts), so the "is this URL well-formed" rule stays in one
// place rather than being redefined per call site.
export function isWellFormedUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// An option is always plain text — pulled into a helper since all four
// options resolve identically, and exported for the same per-question edit
// form reuse reason as isWellFormedUrl above. Per-option images were
// dropped (never used by any real seeded/imported row); a question's own
// diagram/figure is still supported via the single questionImage field.
export function resolveOption(label: string, text: string): { error?: string; option?: QuestionOption } {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return { error: `${label} is required` };
  }
  return { option: { type: "text", content: trimmedText } };
}

// Strict, position-only: "1"-"4" mean Option A-D respectively. Deliberately
// does not accept letters (A-D) or the option's literal text — many source
// papers key answers by position, so this is a hard requirement rather than
// best-effort format-sniffing across several conventions. Exported for the
// same per-question edit form reuse reason as the two helpers above.
export function parseCorrectAnswerPosition(value: string): { error?: string; index?: number } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { error: "Correct answer is required" };
  }
  if (!/^[1-4]$/.test(trimmed)) {
    return { error: `Correct answer must be 1-4 (position), got '${value}'` };
  }
  return { index: Number(trimmed) - 1 };
}

export function validateBulkRow(row: BulkUploadRow, ref: BulkUploadReferenceData): ValidatedBulkRow {
  const errors: string[] = [];

  const required: [string, string][] = [
    ["Question text", row.questionText],
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

  // "Correct answer" itself is already covered by the required-fields loop
  // above, so an empty value's error there isn't duplicated here.
  const correctAnswerRaw = row.correctAnswer.trim();
  let correctIndex = -1;
  if (correctAnswerRaw) {
    const parsed = parseCorrectAnswerPosition(correctAnswerRaw);
    if (parsed.error) {
      errors.push(parsed.error);
    } else {
      correctIndex = parsed.index!;
    }
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

  const optionA = resolveOption("Option A", row.optionA);
  const optionB = resolveOption("Option B", row.optionB);
  const optionC = resolveOption("Option C", row.optionC);
  const optionD = resolveOption("Option D", row.optionD);
  for (const resolvedOpt of [optionA, optionB, optionC, optionD]) {
    if (resolvedOpt.error) errors.push(resolvedOpt.error);
  }

  // Blank is always valid — never pushed as an error — and resolves to null
  // rather than an empty string, matching questionImage's own null-vs-empty
  // convention.
  const trimmedHint = row.hint.trim();
  const hint = trimmedHint || null;

  const trimmedQuestionImageUrl = row.questionImageUrl.trim();
  let questionImage: QuestionImage | null = null;
  if (trimmedQuestionImageUrl) {
    if (!isWellFormedUrl(trimmedQuestionImageUrl)) {
      errors.push(`Question Image URL "${row.questionImageUrl}" is not a well-formed URL`);
    } else {
      questionImage = { type: "image", content: trimmedQuestionImageUrl };
    }
  }

  if (
    errors.length > 0 ||
    !matchedSubTopic ||
    !isDifficultyValue(difficultyRaw) ||
    !optionA.option ||
    !optionB.option ||
    !optionC.option ||
    !optionD.option
  ) {
    return { row, errors, resolved: null };
  }

  return {
    row,
    errors: [],
    resolved: {
      subTopicId: matchedSubTopic.id,
      paperId: matchedPaper?.id ?? null,
      questionText: row.questionText.trim(),
      questionImage,
      options: [optionA.option, optionB.option, optionC.option, optionD.option],
      correctOption: correctIndex,
      difficulty: difficultyRaw,
      keywords: row.keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
      hint,
    },
  };
}

export function validateBulkRows(rows: BulkUploadRow[], ref: BulkUploadReferenceData): ValidatedBulkRow[] {
  return rows.map((row) => validateBulkRow(row, ref));
}
