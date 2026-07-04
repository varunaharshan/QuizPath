import { db } from "./index";
import { subjects, modules, subTopics, mcqs, papers } from "./schema";
import { and, eq } from "drizzle-orm";

type Medium = "sinhala" | "tamil" | "english";
type PaperType = "provincial" | "district" | "school";

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

// Placeholder past papers, so the paper-based Practice flow is testable
// before real past papers are digitized. Question text is plain English for
// all of them regardless of the paper's tagged medium — these are flow-test
// filler, not real translated exam content (which would need actual review,
// not an AI guess at Sinhala/Tamil science terminology).
const PAPER_SEED: Record<
  "10" | "11",
  { paperType: PaperType; title: string; year: number; medium: Medium; source: string }[]
> = {
  "10": [
    {
      paperType: "provincial",
      title: "Western Province Provincial Paper",
      year: 2023,
      medium: "sinhala",
      source: "Western Province",
    },
    {
      paperType: "provincial",
      title: "North Central Province Provincial Paper",
      year: 2022,
      medium: "english",
      source: "North Central Province",
    },
    {
      paperType: "district",
      title: "Colombo District Paper",
      year: 2023,
      medium: "english",
      source: "Colombo District",
    },
    {
      paperType: "district",
      title: "Jaffna District Paper",
      year: 2022,
      medium: "tamil",
      source: "Jaffna District",
    },
    {
      paperType: "school",
      title: "Royal College Term Test",
      year: 2023,
      medium: "english",
      source: "Royal College",
    },
    {
      paperType: "school",
      title: "Hindu College Term Test",
      year: 2022,
      medium: "tamil",
      source: "Hindu College",
    },
  ],
  "11": [
    {
      paperType: "provincial",
      title: "Southern Province Provincial Paper",
      year: 2023,
      medium: "sinhala",
      source: "Southern Province",
    },
    {
      paperType: "provincial",
      title: "Eastern Province Provincial Paper",
      year: 2022,
      medium: "tamil",
      source: "Eastern Province",
    },
    {
      paperType: "district",
      title: "Kandy District Paper",
      year: 2023,
      medium: "sinhala",
      source: "Kandy District",
    },
    {
      paperType: "district",
      title: "Batticaloa District Paper",
      year: 2022,
      medium: "tamil",
      source: "Batticaloa District",
    },
    {
      paperType: "school",
      title: "Visakha Vidyalaya Term Test",
      year: 2023,
      medium: "sinhala",
      source: "Visakha Vidyalaya",
    },
    {
      paperType: "school",
      title: "St. Thomas' College Term Test",
      year: 2022,
      medium: "english",
      source: "St. Thomas' College",
    },
  ],
};

const GENERIC_PLACEHOLDER_QUESTIONS: { question: string; options: string[]; correctOption: number }[] = [
  { question: "What is 2 + 2?", options: ["3", "4", "5", "6"], correctOption: 1 },
  {
    question: "What is the chemical symbol for water?",
    options: ["O2", "H2O", "CO2", "NaCl"],
    correctOption: 1,
  },
  { question: "The sun rises in the:", options: ["West", "North", "East", "South"], correctOption: 2 },
  { question: "How many continents are there on Earth?", options: ["5", "6", "7", "8"], correctOption: 2 },
  {
    question: "What is the boiling point of water at sea level, in °C?",
    options: ["50", "100", "150", "200"],
    correctOption: 1,
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

async function seedPlaceholderPapers(subjectId: string) {
  const existingPaper = await db.query.papers.findFirst({ where: eq(papers.subjectId, subjectId) });
  if (existingPaper) {
    console.log("Placeholder papers already seeded, skipping.");
    return;
  }

  let paperCount = 0;
  for (const grade of ["10", "11"] as const) {
    for (const entry of PAPER_SEED[grade]) {
      const [paper] = await db
        .insert(papers)
        .values({
          subjectId,
          grade,
          medium: entry.medium,
          paperType: entry.paperType,
          title: entry.title,
          year: entry.year,
          source: entry.source,
          status: "published",
        })
        .returning();
      paperCount += 1;

      await db.insert(mcqs).values(
        GENERIC_PLACEHOLDER_QUESTIONS.map((q) => ({
          paperId: paper.id,
          questionText: PLACEHOLDER_PREFIX + q.question,
          options: q.options,
          correctOption: q.correctOption,
          difficulty: "medium" as const,
          status: "published" as const,
        })),
      );
    }
  }

  console.log(
    `Seed complete: ${paperCount} placeholder papers with ${GENERIC_PLACEHOLDER_QUESTIONS.length} MCQs each.`,
  );
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
  await seedPlaceholderPapers(subject.id);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
