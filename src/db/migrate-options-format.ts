import { eq } from "drizzle-orm";
import { db } from "./index";
import { mcqs, type QuestionOption } from "./schema";

// One-off (but safely re-runnable) conversion of mcqs.options from the old
// flat string-array format (e.g. ["3","4","5","6"]) to the new
// {type:"text"|"image", content:string}[] shape (see schema.ts's
// QuestionOption type) — wraps each existing string as
// {type:"text", content:<string>}. Drizzle's $type is a compile-time
// assertion only, not a runtime guarantee, so rows written before this
// migration are still plain strings at runtime regardless of what the
// schema now declares — this checks the actual shape per row rather than
// trusting it, and skips any row already in the new shape, so a re-run
// (e.g. after seeding more old-format fixtures) never double-wraps
// anything.
async function main() {
  const rows = await db.select({ id: mcqs.id, options: mcqs.options }).from(mcqs);

  let migrated = 0;
  let alreadyMigrated = 0;

  for (const row of rows) {
    const rawOptions = row.options as unknown as (string | QuestionOption)[];
    const isAlreadyMigrated = rawOptions.every((opt) => typeof opt === "object" && opt !== null && "type" in opt);
    if (isAlreadyMigrated) {
      alreadyMigrated++;
      continue;
    }

    const converted: QuestionOption[] = rawOptions.map((opt) =>
      typeof opt === "string" ? { type: "text", content: opt } : opt,
    );
    await db.update(mcqs).set({ options: converted }).where(eq(mcqs.id, row.id));
    migrated++;
  }

  console.log("Options-format migration complete.");
  console.log(`  Total rows:       ${rows.length}`);
  console.log(`  Migrated:         ${migrated}`);
  console.log(`  Already migrated: ${alreadyMigrated}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
