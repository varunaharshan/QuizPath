import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  numeric,
  primaryKey,
  check,
  unique,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const userStatusEnum = pgEnum("user_status", ["active", "suspended"]);
export const userRoleEnum = pgEnum("user_role", ["student", "admin"]);
export const gradeEnum = pgEnum("grade", ["10", "11"]);
export const contentStatusEnum = pgEnum("content_status", ["draft", "published"]);
export const mcqDifficultyEnum = pgEnum("mcq_difficulty", ["easy", "medium", "hard"]);
// Separate from contentStatusEnum's draft/published gate — a bulk-imported
// question is "unverified" (nobody has reviewed its content yet) regardless
// of whether it's also published; see src/lib/bulk-upload.ts.
export const mcqVerificationStatusEnum = pgEnum("mcq_verification_status", ["unverified", "verified"]);
// Language of instruction. A student's medium is a durable profile attribute;
// a paper's medium is the paper's own language, independent of who's reading it.
export const mediumEnum = pgEnum("medium", ["sinhala", "tamil", "english"]);
export const paperTypeEnum = pgEnum("paper_type", ["provincial", "district", "school"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "inactive",
  "active",
  "past_due",
  "canceled",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  // External identity from the managed auth provider (Clerk). Needed to map
  // an auth session back to this row; not called out explicitly in the spec's
  // conceptual users table but required to implement it.
  authProviderId: text("auth_provider_id").notNull().unique(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  // Display name from the auth provider's profile (e.g. Clerk's Google
  // first/last name). Nullable since it's just for display, never an
  // identity key.
  name: varchar("name", { length: 200 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  status: userStatusEnum("status").notNull().default("active"),
  // Gates access to /admin/* (see src/lib/current-app-user.ts
  // requireAdminUser and src/app/admin/layout.tsx). NOT NULL with a default
  // so every existing row backfills to "student" on migration, same pattern
  // as student_profiles.medium.
  role: userRoleEnum("role").notNull().default("student"),
});

export const studentProfiles = pgTable("student_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  grade: gradeEnum("grade").notNull(),
  // NOT NULL with a default so existing rows (created before this field
  // existed) backfill to "english" on migration rather than needing a
  // separate "medium not set yet" state threaded through the app.
  medium: mediumEnum("medium").notNull().default("english"),
});

export const subjects = pgTable("subjects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  // Pins a language subject (English/Sinhala/Tamil, not built yet) to its own
  // language regardless of the student's profile medium. Null for content
  // subjects like Science, whose papers are filtered by the student's medium.
  fixedMedium: mediumEnum("fixed_medium"),
});

export const modules = pgTable("modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id")
    .notNull()
    .references(() => subjects.id, { onDelete: "cascade" }),
  grade: gradeEnum("grade").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const subTopics = pgTable("sub_topics", {
  id: uuid("id").primaryKey().defaultRandom(),
  moduleId: uuid("module_id")
    .notNull()
    .references(() => modules.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const contentItems = pgTable("content_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  subTopicId: uuid("sub_topic_id")
    .notNull()
    .references(() => subTopics.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 300 }).notNull(),
  storageUri: text("storage_uri"),
  status: contentStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// A whole past exam paper (provincial/district/school), not tied to a
// specific module/sub-topic — students take it as one session covering all
// of its questions. `medium` here is the paper's own language, independent
// of the student's profile medium (see subjects.fixedMedium).
export const papers = pgTable("papers", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id")
    .notNull()
    .references(() => subjects.id, { onDelete: "cascade" }),
  grade: gradeEnum("grade").notNull(),
  medium: mediumEnum("medium").notNull(),
  paperType: paperTypeEnum("paper_type").notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  year: integer("year"),
  source: varchar("source", { length: 200 }),
  status: contentStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Nullable, admin-settable via Papers Management — an earlier pass
  // deliberately dropped this field ("content starts simple, add fields
  // when there's a real need"), reintroduced now that the student-facing
  // Papers grid/detail redesign needs a real "suggested time" to show
  // rather than guessing one from question count.
  timeLimitMinutes: integer("time_limit_minutes"),
});

// An option is always plain text — "type" stays a literal discriminant
// (rather than a bare string[]) so existing rows (all already stored as
// {type:"text", content:...} — see src/db/migrate-options-format.ts) don't
// need any data migration, and so a future per-option variant could be
// added again without a shape change. Per-option images were dropped
// (never used by any real seeded/imported row) in favor of a single
// question-level image field (questionImage, below) — one diagram per
// question, not per option.
export type QuestionOption = { type: "text"; content: string };
// A question's own diagram/figure (the stem's illustration) — the only
// image field left on a question now that per-option images are gone.
export type QuestionImage = { type: "image"; content: string };

export const mcqs = pgTable("mcqs", {
  id: uuid("id").primaryKey().defaultRandom(),
  contentItemId: uuid("content_item_id").references(() => contentItems.id, {
    onDelete: "set null",
  }),
  // Nullable: a past-paper MCQ may have no natural sub-topic to tag. Tag both
  // when sensible (e.g. a paper question that clearly maps to a sub-topic)
  // so sub-topic mastery tracking keeps working for those.
  subTopicId: uuid("sub_topic_id").references(() => subTopics.id, { onDelete: "cascade" }),
  paperId: uuid("paper_id").references(() => papers.id, { onDelete: "cascade" }),
  // Position within its own paper (0-based, in original CSV/import row
  // order) — 0/unused for a question with no paperId, since a standalone
  // sub-topic practice-bank question has no canonical "original order" to
  // preserve. Exists because ordering paper questions by createdAt alone is
  // unreliable: Bulk Upload inserts a whole paper's questions in one
  // multi-row INSERT, and Postgres evaluates now()/defaultNow() once per
  // statement, not per row, so every question in that batch gets an
  // identical createdAt — any later UPDATE (e.g. verifying one question)
  // can then silently reshuffle the tied group's apparent order. See
  // src/db/backfill-question-sort-order.ts for the one-off backfill this
  // column needed when it was introduced.
  sortOrder: integer("sort_order").notNull().default(0),
  questionText: text("question_text").notNull(),
  // Array of QuestionOption rather than plain strings — see
  // src/db/migrate-options-format.ts for the one-off conversion of rows
  // seeded/imported before this shape existed. correctOption still indexes
  // into this array positionally; grading never reads an option's content.
  options: jsonb("options").$type<QuestionOption[]>().notNull(),
  correctOption: integer("correct_option").notNull(),
  // Nullable: most questions have no diagram/figure attached to the stem.
  // Not stored via content_items — that table requires a title and carries
  // its own draft/published status meant for something more like attached
  // reading material, not a lightweight image reference.
  questionImage: jsonb("question_image").$type<QuestionImage>(),
  // Nullable: an optional hint students can reveal before answering (see
  // <QuizForm>'s "Show hint" toggle). Free text, not part of options/
  // correctOption — grading never reads this column.
  hint: text("hint"),
  difficulty: mcqDifficultyEnum("difficulty").notNull().default("medium"),
  status: contentStatusEnum("status").notNull().default("draft"),
  // Whether anyone has reviewed this question's content — independent of
  // status (draft/published). Bulk-imported questions (src/lib/bulk-upload.ts)
  // always land as "unverified"; every other existing row backfills to
  // "unverified" too, since none of them have gone through a review step
  // that doesn't exist yet either.
  verificationStatus: mcqVerificationStatusEnum("verification_status").notNull().default("unverified"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Free-form search tags (e.g. "Microorganisms", "Ohm's Law"), 0-3 per
  // question. Deliberately a plain array column on the question itself, not
  // a separate keyword-to-topic mapping table — a keyword's topic
  // association is purely implicit (whichever sub-topic(s) its tagged
  // questions happen to belong to), so the same keyword can end up spanning
  // multiple topics with no schema change. Backfilled via
  // src/db/backfill-keywords.ts; see CLAUDE.md "What's NOT built yet" for
  // why there's no admin UI to hand-edit these yet.
  keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
});

export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Exactly one of subTopicId/paperId is set (enforced below) — an attempt
    // is structurally either a sub-topic quiz or a paper quiz.
    subTopicId: uuid("sub_topic_id").references(() => subTopics.id, { onDelete: "cascade" }),
    paperId: uuid("paper_id").references(() => papers.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    score: numeric("score", { precision: 5, scale: 2 }),
  },
  (table) => [
    check(
      "quiz_attempts_exactly_one_target",
      sql`(${table.subTopicId} is not null) <> (${table.paperId} is not null)`,
    ),
  ],
);

export const quizAttemptAnswers = pgTable(
  "quiz_attempt_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quizAttemptId: uuid("quiz_attempt_id")
      .notNull()
      .references(() => quizAttempts.id, { onDelete: "cascade" }),
    mcqId: uuid("mcq_id")
      .notNull()
      .references(() => mcqs.id, { onDelete: "cascade" }),
    selectedOption: integer("selected_option").notNull(),
    isCorrect: boolean("is_correct").notNull(),
  },
  (table) => [
    // One saved answer per question per attempt — lets an in-progress answer
    // be changed by upserting on this pair, rather than accumulating stale
    // rows every time a student revises a choice before submitting.
    unique("quiz_attempt_answers_attempt_mcq_unique").on(table.quizAttemptId, table.mcqId),
  ],
);

export const masteryScores = pgTable(
  "mastery_scores",
  {
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subTopicId: uuid("sub_topic_id")
      .notNull()
      .references(() => subTopics.id, { onDelete: "cascade" }),
    score: numeric("score", { precision: 5, scale: 2 }).notNull().default("0"),
    // Cumulative denominator behind `score` — total questions ever answered
    // for this sub-topic across every attempt (sub-topic quizzes and any
    // paper questions tagged with this sub_topic_id), so the UI can show
    // confidence (e.g. "52% (based on 6 questions)") rather than presenting
    // a thin sample as equally reliable as a large one.
    questionsAnswered: integer("questions_answered").notNull().default(0),
    lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.studentId, table.subTopicId] })],
);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: subscriptionStatusEnum("status").notNull().default("inactive"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subjectsRelations = relations(subjects, ({ many }) => ({
  modules: many(modules),
}));

export const modulesRelations = relations(modules, ({ one, many }) => ({
  subject: one(subjects, { fields: [modules.subjectId], references: [subjects.id] }),
  subTopics: many(subTopics),
}));

export const subTopicsRelations = relations(subTopics, ({ one }) => ({
  module: one(modules, { fields: [subTopics.moduleId], references: [modules.id] }),
}));
