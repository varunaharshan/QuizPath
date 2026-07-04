import { db } from "./index";
import {
  subjects,
  modules,
  subTopics,
  mcqs,
  papers,
  users,
  studentProfiles,
  quizAttempts,
  quizAttemptAnswers,
  masteryScores,
  subscriptions,
  contentItems,
} from "./schema";
import { and, eq, inArray } from "drizzle-orm";

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

// The real Grade 10 O/L Science syllabus's 20 main topics (as opposed to
// TAXONOMY above, which is placeholder filler) — grouped into Biology,
// Physics, and Chemistry modules purely for display grouping. Used to tag
// the two full-syllabus model papers below so each of their questions is
// attributable to a specific topic (mcqs.subTopicId + mcqs.paperId both set,
// per the "tag both where sensible" design — this also means these
// questions are servable from the ordinary sub-topic quiz flow, not just
// from within the paper).
const FULL_SYLLABUS_MODULES: { module: string; topics: string[] }[] = [
  {
    module: "Biology",
    topics: [
      "Chemical basis of life",
      "Structure and functions of the plant and animal cell",
      "Characteristics of organisms",
      "The world of life",
      "Continuity of life",
      "Inheritance",
    ],
  },
  {
    module: "Physics",
    topics: [
      "Motion in a straight line",
      "Newton's laws of motion",
      "Friction",
      "Resultant force",
      "Turning effect of a force",
      "Equilibrium of forces",
      "Hydrostatic pressure and its applications",
      "Work, energy and power",
      "Current electricity",
    ],
  },
  {
    module: "Chemistry",
    topics: [
      "Structure of matter",
      "Quantification of elements and compounds",
      "Chemical bonds",
      "Changes in matter",
      "Rate of reactions",
    ],
  },
];

// The order the topics appear in the source syllabus list — used to lay out
// each model paper's 40 questions in a natural topic sequence, independent
// of how they're grouped into modules above.
const FULL_SYLLABUS_TOPIC_ORDER: string[] = [
  "Chemical basis of life",
  "Motion in a straight line",
  "Structure of matter",
  "Newton's laws of motion",
  "Friction",
  "Structure and functions of the plant and animal cell",
  "Quantification of elements and compounds",
  "Characteristics of organisms",
  "Resultant force",
  "Chemical bonds",
  "Turning effect of a force",
  "Equilibrium of forces",
  "The world of life",
  "Continuity of life",
  "Hydrostatic pressure and its applications",
  "Changes in matter",
  "Rate of reactions",
  "Work, energy and power",
  "Current electricity",
  "Inheritance",
];

// 4 questions per topic: the first 2 go into Model Paper I, the last 2 into
// Model Paper II, so each 40-question paper has exactly 2 questions per
// topic and no question is reused across the two papers.
const FULL_SYLLABUS_QUESTIONS: Record<
  string,
  { question: string; options: string[]; correctOption: number }[]
> = {
  "Chemical basis of life": [
    {
      question: "Which element is present in all organic compounds found in living organisms?",
      options: ["Carbon", "Iron", "Sodium", "Sulfur"],
      correctOption: 0,
    },
    {
      question: "Water makes up approximately what percentage of the human body?",
      options: ["30%", "50%", "65%", "90%"],
      correctOption: 2,
    },
    {
      question: "Which biomolecule is the primary source of stored energy in most cells?",
      options: ["Protein", "Carbohydrate", "Vitamin", "Mineral"],
      correctOption: 1,
    },
    {
      question: "Proteins are made up of building blocks called:",
      options: ["Fatty acids", "Amino acids", "Nucleotides", "Monosaccharides"],
      correctOption: 1,
    },
  ],
  "Motion in a straight line": [
    {
      question: "An object moving with constant velocity has:",
      options: ["Increasing acceleration", "Zero acceleration", "Increasing speed", "Decreasing speed"],
      correctOption: 1,
    },
    {
      question: "Displacement is best described as:",
      options: [
        "The total path length travelled",
        "The shortest distance between initial and final position, with direction",
        "Speed multiplied by time",
        "The rate of change of speed",
      ],
      correctOption: 1,
    },
    {
      question: "The area under a velocity-time graph represents:",
      options: ["Acceleration", "Displacement", "Force", "Momentum"],
      correctOption: 1,
    },
    {
      question: "A body starting from rest and moving with uniform acceleration covers a distance proportional to:",
      options: ["Time", "Time squared", "Square root of time", "1/Time"],
      correctOption: 1,
    },
  ],
  "Structure of matter": [
    {
      question: "Which of the following is a sub-atomic particle with a negative charge?",
      options: ["Proton", "Neutron", "Electron", "Nucleus"],
      correctOption: 2,
    },
    {
      question: "The number of protons in an atom's nucleus is called its:",
      options: ["Mass number", "Atomic number", "Isotope number", "Valency"],
      correctOption: 1,
    },
    {
      question: "Atoms of the same element with different numbers of neutrons are called:",
      options: ["Ions", "Isotopes", "Isomers", "Isobars"],
      correctOption: 1,
    },
    {
      question: "The nucleus of an atom contains:",
      options: ["Protons and electrons", "Protons and neutrons", "Electrons and neutrons", "Only electrons"],
      correctOption: 1,
    },
  ],
  "Newton's laws of motion": [
    {
      question: "Newton's first law of motion is also known as the law of:",
      options: ["Inertia", "Action and reaction", "Acceleration", "Gravitation"],
      correctOption: 0,
    },
    {
      question: "According to Newton's second law, force is equal to:",
      options: ["Mass ÷ acceleration", "Mass × acceleration", "Mass × velocity", "Mass ÷ velocity"],
      correctOption: 1,
    },
    {
      question: "Newton's third law states that for every action there is a:",
      options: ["Larger reaction", "Equal and opposite reaction", "Smaller reaction", "No reaction"],
      correctOption: 1,
    },
    {
      question: "An object at rest stays at rest unless acted upon by an external force — this describes:",
      options: ["Newton's third law", "Newton's first law", "Newton's second law", "The law of gravitation"],
      correctOption: 1,
    },
  ],
  Friction: [
    {
      question: "Friction between two surfaces always acts:",
      options: ["In the direction of motion", "Opposite to the direction of motion", "Perpendicular to motion", "In no particular direction"],
      correctOption: 1,
    },
    {
      question: "Which of the following reduces friction the most?",
      options: ["Rough surfaces", "Applying lubricant", "Increasing surface area", "Increasing weight"],
      correctOption: 1,
    },
    {
      question: "Friction that acts on a stationary object being pushed but not yet moving is called:",
      options: ["Kinetic friction", "Static friction", "Rolling friction", "Fluid friction"],
      correctOption: 1,
    },
    {
      question: "Ball bearings are used in machines mainly to:",
      options: ["Increase friction", "Reduce friction by converting sliding to rolling", "Increase weight", "Increase heat"],
      correctOption: 1,
    },
  ],
  "Structure and functions of the plant and animal cell": [
    {
      question: "Which structure is found in plant cells but not in animal cells?",
      options: ["Nucleus", "Cell wall", "Mitochondria", "Cell membrane"],
      correctOption: 1,
    },
    {
      question: "The organelle responsible for producing energy in a cell is the:",
      options: ["Ribosome", "Golgi apparatus", "Mitochondrion", "Vacuole"],
      correctOption: 2,
    },
    {
      question: "Which organelle contains chlorophyll and carries out photosynthesis?",
      options: ["Mitochondrion", "Chloroplast", "Nucleus", "Lysosome"],
      correctOption: 1,
    },
    {
      question: "The control centre of the cell, containing genetic material, is the:",
      options: ["Nucleus", "Cytoplasm", "Ribosome", "Cell membrane"],
      correctOption: 0,
    },
  ],
  "Quantification of elements and compounds": [
    {
      question: "The mole is a unit used to measure the:",
      options: ["Mass of a substance", "Amount of substance", "Volume of a gas", "Density of a liquid"],
      correctOption: 1,
    },
    {
      question: "Avogadro's number represents the number of particles in:",
      options: ["1 gram of a substance", "1 litre of a gas", "1 mole of a substance", "1 atom of an element"],
      correctOption: 2,
    },
    {
      question: "The molar mass of a substance is expressed in units of:",
      options: ["g/mol", "mol/g", "g/L", "mol/L"],
      correctOption: 0,
    },
    {
      question: "Relative atomic mass is measured relative to which standard?",
      options: ["Hydrogen-1", "Oxygen-16", "Carbon-12", "Helium-4"],
      correctOption: 2,
    },
  ],
  "Characteristics of organisms": [
    {
      question: "Which of the following is NOT a characteristic of living organisms?",
      options: ["Growth", "Reproduction", "Crystallization", "Respiration"],
      correctOption: 2,
    },
    {
      question: "The process by which organisms respond to changes in their environment is called:",
      options: ["Excretion", "Irritability", "Nutrition", "Respiration"],
      correctOption: 1,
    },
    {
      question: "The removal of metabolic waste from an organism's body is called:",
      options: ["Nutrition", "Excretion", "Respiration", "Growth"],
      correctOption: 1,
    },
    {
      question: "Which characteristic allows organisms to produce offspring similar to themselves?",
      options: ["Growth", "Movement", "Reproduction", "Nutrition"],
      correctOption: 2,
    },
  ],
  "Resultant force": [
    {
      question: "When two forces act in the same direction on an object, the resultant force is:",
      options: ["Their difference", "Their sum", "Zero", "Their product"],
      correctOption: 1,
    },
    {
      question: "If two equal and opposite forces act on an object, the resultant force is:",
      options: ["Doubled", "Zero", "Halved", "Unchanged direction but larger"],
      correctOption: 1,
    },
    {
      question: "The resultant of two forces acting at an angle to each other can be found using:",
      options: ["Addition only", "Subtraction only", "The parallelogram law", "Multiplication"],
      correctOption: 2,
    },
    {
      question: "A resultant force acting on an object will cause a change in the object's:",
      options: ["Mass", "Motion", "Colour", "Temperature only"],
      correctOption: 1,
    },
  ],
  "Chemical bonds": [
    {
      question: "A bond formed by the transfer of electrons between atoms is called a:",
      options: ["Covalent bond", "Ionic bond", "Metallic bond", "Hydrogen bond"],
      correctOption: 1,
    },
    {
      question: "A covalent bond is formed by the:",
      options: ["Transfer of electrons", "Sharing of electrons", "Loss of protons", "Gain of neutrons"],
      correctOption: 1,
    },
    {
      question: "Ionic compounds typically have:",
      options: ["Low melting points", "High melting points", "No melting point", "Melting points below 0°C"],
      correctOption: 1,
    },
    {
      question: "Metallic bonding involves a 'sea' of delocalised:",
      options: ["Protons", "Neutrons", "Electrons", "Ions only"],
      correctOption: 2,
    },
  ],
  "Turning effect of a force": [
    {
      question: "The turning effect of a force about a pivot is called:",
      options: ["Momentum", "Torque (moment)", "Impulse", "Pressure"],
      correctOption: 1,
    },
    {
      question: "The moment of a force is calculated as:",
      options: ["Force × perpendicular distance from pivot", "Force ÷ distance", "Mass × acceleration", "Force × time"],
      correctOption: 0,
    },
    {
      question: "Increasing the distance from the pivot at which a force is applied will:",
      options: ["Decrease the moment", "Increase the moment", "Have no effect on the moment", "Reverse the direction of the moment"],
      correctOption: 1,
    },
    {
      question: "A spanner with a longer handle makes it easier to loosen a bolt because it:",
      options: ["Reduces the force needed by increasing the moment arm", "Increases friction", "Reduces the bolt's mass", "Increases the bolt's mass"],
      correctOption: 0,
    },
  ],
  "Equilibrium of forces": [
    {
      question: "An object is in equilibrium when the resultant force acting on it is:",
      options: ["Maximum", "Zero", "Increasing", "Doubled"],
      correctOption: 1,
    },
    {
      question: "For an object to be in rotational equilibrium, the sum of clockwise moments must equal the sum of:",
      options: ["Anticlockwise moments", "Linear forces", "Gravitational forces", "Frictional forces"],
      correctOption: 0,
    },
    {
      question: "The principle of moments states that for a body in equilibrium, the sum of clockwise moments equals the sum of:",
      options: ["Its mass", "Anticlockwise moments", "Its weight", "Applied forces only"],
      correctOption: 1,
    },
    {
      question: "A see-saw balanced perfectly with two people sitting on either side is an example of:",
      options: ["Unbalanced force", "Equilibrium of forces", "Newton's third law only", "Kinetic energy"],
      correctOption: 1,
    },
  ],
  "The world of life": [
    {
      question: "The scientific study of living organisms is called:",
      options: ["Biology", "Physics", "Chemistry", "Geology"],
      correctOption: 0,
    },
    {
      question:
        "Which kingdom includes organisms that are typically multicellular, photosynthetic, and have cell walls made of cellulose?",
      options: ["Animalia", "Plantae", "Fungi", "Monera"],
      correctOption: 1,
    },
    {
      question: "The system used to classify living organisms into groups is called:",
      options: ["Taxonomy", "Ecology", "Physiology", "Genetics"],
      correctOption: 0,
    },
    {
      question: "Which of these is the smallest unit of biological classification?",
      options: ["Kingdom", "Species", "Phylum", "Class"],
      correctOption: 1,
    },
  ],
  "Continuity of life": [
    {
      question: "The process by which living organisms produce offspring is called:",
      options: ["Nutrition", "Reproduction", "Respiration", "Excretion"],
      correctOption: 1,
    },
    {
      question: "Which type of reproduction involves a single parent and produces genetically identical offspring?",
      options: ["Sexual reproduction", "Asexual reproduction", "Cross-fertilization", "Pollination"],
      correctOption: 1,
    },
    {
      question: "The fusion of a male and female gamete to form a zygote is called:",
      options: ["Fertilization", "Germination", "Pollination", "Excretion"],
      correctOption: 0,
    },
    {
      question: "Sexual reproduction increases genetic:",
      options: ["Uniformity", "Variation", "Mutation rate only", "Cell number only"],
      correctOption: 1,
    },
  ],
  "Hydrostatic pressure and its applications": [
    {
      question: "Hydrostatic pressure at a point in a liquid depends on:",
      options: ["The shape of the container", "The depth of the point below the surface", "The colour of the liquid", "The surface area of the container"],
      correctOption: 1,
    },
    {
      question: "A hydraulic system works based on the principle that:",
      options: [
        "Pressure applied to a confined liquid is transmitted equally in all directions",
        "Gases expand more than liquids",
        "Liquids cannot be compressed at all",
        "Pressure decreases with depth",
      ],
      correctOption: 0,
    },
    {
      question: "As depth in a liquid increases, hydrostatic pressure:",
      options: ["Decreases", "Stays constant", "Increases", "Becomes zero"],
      correctOption: 2,
    },
    {
      question: "A dam wall is built thicker at the bottom because:",
      options: ["Hydrostatic pressure is greater at greater depths", "Water is heavier at the top", "The dam is decorative", "Pressure is constant throughout"],
      correctOption: 0,
    },
  ],
  "Changes in matter": [
    {
      question: "Melting of ice is an example of a:",
      options: ["Chemical change", "Physical change", "Nuclear change", "Biological change"],
      correctOption: 1,
    },
    {
      question: "Which of the following is a chemical change?",
      options: ["Boiling of water", "Dissolving sugar in water", "Burning of paper", "Melting of wax"],
      correctOption: 2,
    },
    {
      question: "A physical change generally:",
      options: ["Produces a new substance", "Does not produce a new substance", "Is always irreversible", "Releases a new gas"],
      correctOption: 1,
    },
    {
      question: "Which process is a chemical change?",
      options: ["Evaporation of water", "Rusting of iron", "Freezing of water", "Crushing a rock"],
      correctOption: 1,
    },
  ],
  "Rate of reactions": [
    {
      question: "Increasing the temperature of a reaction generally:",
      options: ["Decreases the rate of reaction", "Increases the rate of reaction", "Has no effect on the rate", "Stops the reaction"],
      correctOption: 1,
    },
    {
      question: "A catalyst speeds up a reaction by:",
      options: [
        "Increasing the temperature",
        "Providing an alternative pathway with lower activation energy",
        "Increasing the concentration of reactants",
        "Decreasing the pressure",
      ],
      correctOption: 1,
    },
    {
      question: "Increasing the surface area of a solid reactant will:",
      options: ["Decrease the rate of reaction", "Increase the rate of reaction", "Have no effect", "Stop the reaction entirely"],
      correctOption: 1,
    },
    {
      question: "A catalyst is a substance that speeds up a reaction without being:",
      options: ["Heated", "Chemically changed itself", "Mixed with reactants", "Present in the reaction"],
      correctOption: 1,
    },
  ],
  "Work, energy and power": [
    {
      question: "Work done is calculated as:",
      options: ["Force × distance moved in the direction of the force", "Force ÷ time", "Mass × velocity", "Force × velocity²"],
      correctOption: 0,
    },
    {
      question: "Power is defined as the rate of doing:",
      options: ["Force", "Work", "Distance", "Mass"],
      correctOption: 1,
    },
    {
      question: "The SI unit of energy is the:",
      options: ["Watt", "Newton", "Joule", "Pascal"],
      correctOption: 2,
    },
    {
      question: "The SI unit of power is the:",
      options: ["Joule", "Newton", "Watt", "Pascal"],
      correctOption: 2,
    },
  ],
  "Current electricity": [
    {
      question: "The SI unit of electric current is the:",
      options: ["Volt", "Ohm", "Ampere", "Watt"],
      correctOption: 2,
    },
    {
      question: "According to Ohm's Law, current is directly proportional to:",
      options: ["Resistance", "Voltage", "Power", "Time"],
      correctOption: 1,
    },
    {
      question: "In a series circuit, the current at every point is:",
      options: ["Different", "The same", "Zero", "Doubled at each component"],
      correctOption: 1,
    },
    {
      question: "The unit of electrical resistance is the:",
      options: ["Ampere", "Volt", "Ohm", "Watt"],
      correctOption: 2,
    },
  ],
  Inheritance: [
    {
      question: "The units of heredity that are passed from parents to offspring are called:",
      options: ["Chromosomes only", "Genes", "Cells", "Enzymes"],
      correctOption: 1,
    },
    {
      question: "A characteristic that is masked by a dominant allele in a heterozygous individual is called:",
      options: ["Dominant", "Recessive", "Codominant", "Mutant"],
      correctOption: 1,
    },
    {
      question: "An organism with two identical alleles for a gene is said to be:",
      options: ["Heterozygous", "Homozygous", "Hybrid", "Mutant"],
      correctOption: 1,
    },
    {
      question: "A diagram used to predict the genotypes of offspring from a genetic cross is called a:",
      options: ["Pedigree chart", "Punnett square", "Phylogenetic tree", "Karyotype"],
      correctOption: 1,
    },
  ],
};

// Two Grade 10 "model paper" style provincial papers exercising the full
// syllabus, one question pair per topic each (40 questions total per paper).
const FULL_SYLLABUS_PAPERS: { title: string; year: number; source: string }[] = [
  { title: "Sabaragamuwa Province Provincial Paper", year: 2024, source: "Sabaragamuwa Province" },
  { title: "Uva Province Provincial Paper", year: 2024, source: "Uva Province" },
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

// Seeds the real 20-topic Grade 10 syllabus (see FULL_SYLLABUS_MODULES)
// as its own set of modules/sub-topics, additive to the placeholder
// TAXONOMY above rather than replacing it. Returns a topic name -> subTopicId
// map (queried back even on a skipped/idempotent run) for
// seedFullSyllabusPapers to tag paper MCQs with.
async function seedFullSyllabusTopics(subjectId: string): Promise<Map<string, string>> {
  const firstTopicName = FULL_SYLLABUS_TOPIC_ORDER[0];
  const existing = await db.query.subTopics.findFirst({ where: eq(subTopics.name, firstTopicName) });

  if (!existing) {
    for (const [moduleIndex, entry] of FULL_SYLLABUS_MODULES.entries()) {
      const [module] = await db
        .insert(modules)
        .values({
          subjectId,
          grade: "10",
          name: entry.module,
          sortOrder: 100 + moduleIndex, // after the placeholder TAXONOMY modules
        })
        .returning();

      await db.insert(subTopics).values(
        entry.topics.map((name, topicIndex) => ({
          moduleId: module.id,
          name,
          sortOrder: topicIndex,
        })),
      );
    }
    console.log(`Seed complete: ${FULL_SYLLABUS_TOPIC_ORDER.length} Grade 10 full-syllabus topics.`);
  } else {
    console.log("Grade 10 full-syllabus topics already seeded, skipping.");
  }

  const rows = await db
    .select({ id: subTopics.id, name: subTopics.name })
    .from(subTopics)
    .where(inArray(subTopics.name, FULL_SYLLABUS_TOPIC_ORDER));
  return new Map(rows.map((r) => [r.name, r.id]));
}

// The two 40-question, topic-tagged model papers (task requirement): each
// paper gets exactly 2 questions per topic, tagged with both paperId (which
// paper it belongs to) and subTopicId (which of the 20 topics it covers).
async function seedFullSyllabusPapers(subjectId: string, topicSubTopicIds: Map<string, string>) {
  const existingPaper = await db.query.papers.findFirst({
    where: eq(papers.title, FULL_SYLLABUS_PAPERS[0].title),
  });
  if (existingPaper) {
    console.log("Full-syllabus model papers already seeded, skipping.");
    return;
  }

  for (const [paperIndex, paperMeta] of FULL_SYLLABUS_PAPERS.entries()) {
    const [paper] = await db
      .insert(papers)
      .values({
        subjectId,
        grade: "10",
        medium: "english",
        paperType: "provincial",
        title: paperMeta.title,
        year: paperMeta.year,
        source: paperMeta.source,
        status: "published",
      })
      .returning();

    for (const topic of FULL_SYLLABUS_TOPIC_ORDER) {
      const subTopicId = topicSubTopicIds.get(topic);
      if (!subTopicId) continue;

      // Questions 0-1 for paper 0 ("Model Paper I"), questions 2-3 for paper 1.
      const [q1, q2] = FULL_SYLLABUS_QUESTIONS[topic].slice(paperIndex * 2, paperIndex * 2 + 2);
      await db.insert(mcqs).values(
        [q1, q2].map((q) => ({
          subTopicId,
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
    `Seed complete: ${FULL_SYLLABUS_PAPERS.length} full-syllabus model papers with 40 topic-tagged MCQs each.`,
  );
}

// A dev-only test student with a completed attempt in each quiz mode, so
// every table in the schema (users, student_profiles, subscriptions,
// quiz_attempts, quiz_attempt_answers, mastery_scores, content_items) has at
// least one row for manual testing. Idempotent on the seed user's email.
async function seedDevTestData(subjectId: string) {
  const DEV_STUDENT_EMAIL = "dev-test-student@example.com";
  const existingUser = await db.query.users.findFirst({ where: eq(users.email, DEV_STUDENT_EMAIL) });
  if (existingUser) {
    console.log("Dev test student already seeded, skipping.");
    return;
  }

  const subTopicTarget = await db.query.subTopics.findFirst({
    where: eq(subTopics.name, "Types of Chemical Reactions"),
  });
  const paperTarget = await db.query.papers.findFirst({
    where: and(eq(papers.subjectId, subjectId), eq(papers.title, "North Central Province Provincial Paper")),
  });
  if (!subTopicTarget || !paperTarget) {
    console.log("Skipping dev test data: run the taxonomy/paper seeds first.");
    return;
  }

  const [student] = await db
    .insert(users)
    .values({
      authProviderId: "seed-dev-test-student",
      email: DEV_STUDENT_EMAIL,
      name: "Dev Test Student",
    })
    .returning();

  await db.insert(studentProfiles).values({ userId: student.id, grade: "10", medium: "english" });
  await db.insert(subscriptions).values({ userId: student.id });

  await db.insert(contentItems).values({
    subTopicId: subTopicTarget.id,
    title: PLACEHOLDER_PREFIX + "Video: Types of Chemical Reactions",
    status: "published",
  });

  // Sub-topic quiz attempt: 7/10 correct (70% -> "in_progress" mastery tier).
  const subTopicMcqs = await db
    .select({ id: mcqs.id, correctOption: mcqs.correctOption })
    .from(mcqs)
    .where(and(eq(mcqs.subTopicId, subTopicTarget.id), eq(mcqs.status, "published")));

  const now = new Date();
  const [subTopicAttempt] = await db
    .insert(quizAttempts)
    .values({ studentId: student.id, subTopicId: subTopicTarget.id, startedAt: now, completedAt: now, score: "70.00" })
    .returning();

  await db.insert(quizAttemptAnswers).values(
    subTopicMcqs.map((mcq, index) => {
      const isCorrect = index < 7;
      return {
        quizAttemptId: subTopicAttempt.id,
        mcqId: mcq.id,
        selectedOption: isCorrect ? mcq.correctOption : (mcq.correctOption + 1) % 4,
        isCorrect,
      };
    }),
  );

  await db.insert(masteryScores).values({ studentId: student.id, subTopicId: subTopicTarget.id, score: "70.00" });

  // Paper quiz attempt: all correct (100%). Paper attempts never touch
  // mastery_scores — see CLAUDE.md "Medium and papers".
  const paperMcqs = await db
    .select({ id: mcqs.id, correctOption: mcqs.correctOption })
    .from(mcqs)
    .where(and(eq(mcqs.paperId, paperTarget.id), eq(mcqs.status, "published")));

  const [paperAttempt] = await db
    .insert(quizAttempts)
    .values({ studentId: student.id, paperId: paperTarget.id, startedAt: now, completedAt: now, score: "100.00" })
    .returning();

  await db.insert(quizAttemptAnswers).values(
    paperMcqs.map((mcq) => ({
      quizAttemptId: paperAttempt.id,
      mcqId: mcq.id,
      selectedOption: mcq.correctOption,
      isCorrect: true,
    })),
  );

  console.log("Seed complete: dev test student with sub-topic + paper attempt history.");
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

  const topicSubTopicIds = await seedFullSyllabusTopics(subject.id);
  await seedFullSyllabusPapers(subject.id, topicSubTopicIds);
  await seedDevTestData(subject.id);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
