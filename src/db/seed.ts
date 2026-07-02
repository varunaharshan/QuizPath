import { db } from "./index";
import { subjects, modules, subTopics } from "./schema";
import { eq } from "drizzle-orm";

// Placeholder taxonomy — a few modules/sub-topics per grade so the app has
// something to render. The real Grade 10/11 Science curriculum gets refined
// separately (spec section 7).
const TAXONOMY: Record<"10" | "11", { module: string; subTopics: string[] }[]> = {
  "10": [
    {
      module: "Chemical Reactions and Equations",
      subTopics: ["Types of Chemical Reactions", "Balancing Equations", "Oxidation and Reduction"],
    },
    {
      module: "Life Processes",
      subTopics: ["Nutrition", "Respiration", "Circulation and Excretion"],
    },
    {
      module: "Electricity",
      subTopics: ["Electric Current and Circuits", "Ohm's Law", "Heating Effects of Current"],
    },
  ],
  "11": [
    {
      module: "Physical World and Measurement",
      subTopics: ["Units and Dimensions", "Errors in Measurement"],
    },
    {
      module: "Cell Structure and Function",
      subTopics: ["Cell Theory", "Cell Organelles", "Cell Division"],
    },
    {
      module: "Thermodynamics",
      subTopics: ["Laws of Thermodynamics", "Heat Engines and Entropy"],
    },
  ],
};

async function main() {
  const [science] = await db
    .insert(subjects)
    .values({ name: "Science" })
    .onConflictDoNothing({ target: subjects.name })
    .returning();

  const subject =
    science ??
    (await db.query.subjects.findFirst({ where: eq(subjects.name, "Science") }))!;

  const existingModule = await db.query.modules.findFirst({
    where: eq(modules.subjectId, subject.id),
  });
  if (existingModule) {
    console.log("Science taxonomy already seeded, skipping.");
    return;
  }

  for (const grade of ["10", "11"] as const) {
    for (const [moduleIndex, entry] of TAXONOMY[grade].entries()) {
      const [module] = await db
        .insert(modules)
        .values({
          subjectId: subject.id,
          grade,
          name: entry.module,
          sortOrder: moduleIndex,
        })
        .returning();

      await db.insert(subTopics).values(
        entry.subTopics.map((name, subTopicIndex) => ({
          moduleId: module.id,
          name,
          sortOrder: subTopicIndex,
        })),
      );
    }
  }

  console.log("Seed complete: Science taxonomy for Grade 10 & 11.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
