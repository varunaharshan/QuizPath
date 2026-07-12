import { sql } from "drizzle-orm";
import { db, pool } from "./index";
import { grades, paperTypes } from "./schema";

// One-off (safely re-runnable) seed for the two new reference tables that
// replaced the grade/paper_type Postgres enums — see CLAUDE.md "Reference
// data: Grades, Subjects, Paper Types" for why. This must be run BETWEEN two
// `drizzle-kit push` runs, not instead of them:
//
// 1. `npx drizzle-kit push` — creates the (empty) grades/paper_types tables
//    and converts modules.grade/student_profiles.grade/papers.grade/
//    papers.paper_type from enum to varchar. It will error out at the last
//    step (adding the new FK constraints) because the reference tables are
//    still empty at that point — that failure is expected, not a sign
//    anything went wrong: Postgres validates a new FK constraint against
//    every existing row immediately, and every existing grade/paper_type
//    value ("10", "provincial", ...) has nowhere to point yet. The column
//    type conversion itself already committed successfully before that step.
// 2. This script — seeds grades/paper_types with the exact values the old
//    enums had, preserving every existing row's value unchanged.
// 3. `npx drizzle-kit push` again — the columns/tables already match the
//    target schema, so this run only needs to add the two FK constraints,
//    which now succeed since the referenced values exist.
async function main() {
  await db
    .insert(grades)
    .values([
      { value: "10", label: "Grade 10", sortOrder: 0 },
      { value: "11", label: "Grade 11", sortOrder: 1 },
    ])
    .onConflictDoNothing({ target: grades.value });

  await db
    .insert(paperTypes)
    .values([
      { value: "provincial", label: "Provincial", sortOrder: 0 },
      { value: "district", label: "District", sortOrder: 1 },
      { value: "school", label: "School", sortOrder: 2 },
    ])
    .onConflictDoNothing({ target: paperTypes.value });

  const gradeRows = await db.select().from(grades).orderBy(sql`sort_order`);
  const paperTypeRows = await db.select().from(paperTypes).orderBy(sql`sort_order`);

  console.log("Reference data seed complete.");
  console.log("Grades:", gradeRows.map((g) => `${g.value} (${g.label})`).join(", "));
  console.log("Paper Types:", paperTypeRows.map((p) => `${p.value} (${p.label})`).join(", "));
  console.log("\nNow run `npx drizzle-kit push` again to add the FK constraints.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
