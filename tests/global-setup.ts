import { execSync } from "node:child_process";
import { Client } from "pg";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://quizpath:quizpath_dev_pw@localhost:5432/quizpath_test";

function push() {
  execSync("npx drizzle-kit push --force", {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
}

// Runs once, in a separate process, before the whole suite: pushes the
// current Drizzle schema onto the dedicated test database. Grade and Paper
// Type are reference tables now (see src/db/migrate-grade-paper-type-to-tables.ts),
// so this needs the same two-push-with-a-seed-in-between dance that
// migration script's own comment explains: the first push converts
// modules/student_profiles/papers' grade (and papers' paper_type) columns
// and creates the two new (empty) reference tables, but errors adding the
// FK constraints since nothing references-able exists yet — expected, not
// a real failure, so it's swallowed here rather than left to crash the
// whole test run. Seeding the two tables, then pushing again, completes it.
export async function setup() {
  try {
    push();
  } catch {
    // Expected on a fresh test database — see comment above.
  }

  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  await client.query(`
    insert into grades (value, label, sort_order) values
      ('10', 'Grade 10', 0),
      ('11', 'Grade 11', 1),
      ('gcse', 'GCSE', 2)
    on conflict (value) do nothing;
  `);
  await client.query(`
    insert into paper_types (value, label, sort_order) values
      ('provincial', 'Provincial', 0),
      ('district', 'District', 1),
      ('school', 'School', 2)
    on conflict (value) do nothing;
  `);
  await client.end();

  push();
}
