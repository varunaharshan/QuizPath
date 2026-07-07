import { findPublishedPlaceholders, PLACEHOLDER_MARKER } from "./placeholder-check";

// Safeguard against a placeholder row (see src/db/seed.ts's PLACEHOLDER_PREFIX)
// ever reaching "published" status in a real environment — run manually
// (npm run db:check-no-published-placeholders) before deploying, or wire
// this into a CI step once one exists (no CI is configured in this repo
// today). Exits non-zero and lists the offending rows if any are found.
async function main() {
  const rows = await findPublishedPlaceholders();
  if (rows.length === 0) {
    console.log(`No published rows contain "${PLACEHOLDER_MARKER}".`);
    return;
  }

  console.error(`Found ${rows.length} published row(s) still containing "${PLACEHOLDER_MARKER}":`);
  for (const row of rows) {
    console.error(`  - [${row.id}] ${row.questionText}`);
  }
  process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
