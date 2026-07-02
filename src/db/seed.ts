import { db } from "./index";
import { subjects, modules, subTopics, mcqs } from "./schema";
import { and, eq } from "drizzle-orm";

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

// Placeholder MCQs so the quiz-taking flow is testable end to end before the
// real, human-reviewed question bank exists (spec section 7). Deliberately
// prefixed so nobody mistakes these for reviewed content later.
const PLACEHOLDER_PREFIX = "[PLACEHOLDER TEST CONTENT] ";
const PLACEHOLDER_MCQS: { question: string; options: string[]; correctOption: number }[] = [
  {
    question: "Which type of reaction involves two or more reactants combining to form a single product?",
    options: ["Combination reaction", "Decomposition reaction", "Displacement reaction", "Double displacement reaction"],
    correctOption: 0,
  },
  {
    question: "In the reaction CaCO₃ → CaO + CO₂, what type of reaction is occurring?",
    options: ["Combination", "Decomposition", "Displacement", "Neutralization"],
    correctOption: 1,
  },
  {
    question: "When zinc reacts with copper sulfate solution and displaces the copper, this is an example of a:",
    options: ["Combination reaction", "Double displacement reaction", "Displacement reaction", "Decomposition reaction"],
    correctOption: 2,
  },
  {
    question: "A reaction in which two compounds exchange ions to form two new compounds is called a:",
    options: ["Combination reaction", "Displacement reaction", "Double displacement reaction", "Combustion reaction"],
    correctOption: 2,
  },
  {
    question: "Which of the following best describes an oxidation reaction?",
    options: ["Gain of electrons", "Loss of electrons", "Loss of protons", "Gain of neutrons"],
    correctOption: 1,
  },
  {
    question: "Rusting of iron is an example of which type of reaction?",
    options: ["Decomposition", "Oxidation", "Displacement", "Neutralization"],
    correctOption: 1,
  },
  {
    question: "The reaction between an acid and a base to form salt and water is called:",
    options: ["Combination reaction", "Neutralization reaction", "Decomposition reaction", "Redox reaction"],
    correctOption: 1,
  },
  {
    question: "Which type of reaction releases heat and light energy, such as the burning of a candle?",
    options: ["Combustion reaction", "Decomposition reaction", "Displacement reaction", "Precipitation reaction"],
    correctOption: 0,
  },
  {
    question: "In a redox reaction, which process happens simultaneously with oxidation?",
    options: ["Neutralization", "Reduction", "Precipitation", "Sublimation"],
    correctOption: 1,
  },
  {
    question: "When two solutions react to form an insoluble solid, the solid formed is called a:",
    options: ["Precipitate", "Residue", "Filtrate", "Distillate"],
    correctOption: 0,
  },
];

async function seedTaxonomy(subjectId: string) {
  const existingModule = await db.query.modules.findFirst({
    where: eq(modules.subjectId, subjectId),
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
          subjectId,
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

async function seedPlaceholderMcqs() {
  const targetSubTopic = await db.query.subTopics.findFirst({
    where: eq(subTopics.name, "Types of Chemical Reactions"),
  });
  if (!targetSubTopic) {
    console.log("Skipping placeholder MCQs: target sub-topic not found (run taxonomy seed first).");
    return;
  }

  const existingMcq = await db.query.mcqs.findFirst({
    where: and(eq(mcqs.subTopicId, targetSubTopic.id), eq(mcqs.status, "published")),
  });
  if (existingMcq) {
    console.log("Placeholder MCQs already seeded, skipping.");
    return;
  }

  await db.insert(mcqs).values(
    PLACEHOLDER_MCQS.map((q) => ({
      subTopicId: targetSubTopic.id,
      questionText: PLACEHOLDER_PREFIX + q.question,
      options: q.options,
      correctOption: q.correctOption,
      difficulty: "medium" as const,
      status: "published" as const,
    })),
  );

  console.log(`Seed complete: ${PLACEHOLDER_MCQS.length} placeholder MCQs under "Types of Chemical Reactions".`);
}

async function main() {
  const [science] = await db
    .insert(subjects)
    .values({ name: "Science" })
    .onConflictDoNothing({ target: subjects.name })
    .returning();

  const subject =
    science ??
    (await db.query.subjects.findFirst({ where: eq(subjects.name, "Science") }))!;

  await seedTaxonomy(subject.id);
  await seedPlaceholderMcqs();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
