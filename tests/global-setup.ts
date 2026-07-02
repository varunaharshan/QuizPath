import { execSync } from "node:child_process";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://quizpath:quizpath_dev_pw@localhost:5432/quizpath_test";

// Runs once, in a separate process, before the whole suite: pushes the
// current Drizzle schema onto the dedicated test database.
export async function setup() {
  execSync("npx drizzle-kit push --force", {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
}
