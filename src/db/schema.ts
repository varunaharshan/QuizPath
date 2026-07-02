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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const userStatusEnum = pgEnum("user_status", ["active", "suspended"]);
export const gradeEnum = pgEnum("grade", ["10", "11"]);
export const contentStatusEnum = pgEnum("content_status", ["draft", "published"]);
export const mcqDifficultyEnum = pgEnum("mcq_difficulty", ["easy", "medium", "hard"]);
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  status: userStatusEnum("status").notNull().default("active"),
});

export const studentProfiles = pgTable("student_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  grade: gradeEnum("grade").notNull(),
});

export const subjects = pgTable("subjects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull().unique(),
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

export const mcqs = pgTable("mcqs", {
  id: uuid("id").primaryKey().defaultRandom(),
  contentItemId: uuid("content_item_id").references(() => contentItems.id, {
    onDelete: "set null",
  }),
  subTopicId: uuid("sub_topic_id")
    .notNull()
    .references(() => subTopics.id, { onDelete: "cascade" }),
  questionText: text("question_text").notNull(),
  options: jsonb("options").$type<string[]>().notNull(),
  correctOption: integer("correct_option").notNull(),
  difficulty: mcqDifficultyEnum("difficulty").notNull().default("medium"),
  status: contentStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quizAttempts = pgTable("quiz_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: uuid("student_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  subTopicId: uuid("sub_topic_id")
    .notNull()
    .references(() => subTopics.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  score: numeric("score", { precision: 5, scale: 2 }),
});

export const quizAttemptAnswers = pgTable("quiz_attempt_answers", {
  id: uuid("id").primaryKey().defaultRandom(),
  quizAttemptId: uuid("quiz_attempt_id")
    .notNull()
    .references(() => quizAttempts.id, { onDelete: "cascade" }),
  mcqId: uuid("mcq_id")
    .notNull()
    .references(() => mcqs.id, { onDelete: "cascade" }),
  selectedOption: integer("selected_option").notNull(),
  isCorrect: boolean("is_correct").notNull(),
});

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
