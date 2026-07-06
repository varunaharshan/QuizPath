// Backs the one-off keyword backfill (src/db/backfill-keywords.ts) — a pure,
// directly-unit-tested function so the extraction logic can be verified
// without a database, and re-run safely if the backfill needs a second pass
// (see tests/keyword-extraction.test.ts). Not a generic NLP pipeline: it's a
// small, curated heuristic calibrated against this app's actual Grade 10/11
// Science question bank (see CLAUDE.md "Practice by Keyword" for the
// broader "no keyword taxonomy table, just tags on questions" design).

const SMALL_WORDS = new Set(["of", "a", "an", "the", "and", "in", "on", "at", "to", "is", "are", "with"]);

function titleCase(text: string): string {
  return text
    .split(/\s+/)
    .map((word, i) => {
      // Preserve formulas/units verbatim (e.g. "H2O") — lowercasing then
      // re-capitalizing only the first letter would mangle them to "H2o".
      if (/\d/.test(word)) return word;
      const lower = word.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Correct-answer strings are usually the best possible keyword for a
// fill-in-the-blank MCQ (e.g. "Excretion", "Ionic bond", "Punnett square"),
// but only when the answer is itself a short noun phrase — many are full
// clauses ("Does not produce a new substance") or formulas ("Mass ×
// acceleration") that make poor search tags, so those are rejected here
// rather than accepted verbatim.
const EXACT_BLACKLIST = new Set([
  "zero",
  "the same",
  "different",
  "increasing",
  "decreasing",
  "unchanged",
  "doubled",
  "halved",
  "maximum",
  "true",
  "false",
  "same",
  "constant",
  "stays constant",
  "becomes zero",
  "no effect",
  "have no effect",
  "has no effect",
  "their sum",
  "their difference",
  "their product",
]);

const GENERIC_LEADING_VERBS = new Set([
  "does",
  "has",
  "have",
  "increases",
  "decreases",
  "reduces",
  "produces",
  "releases",
  "provides",
  "prevents",
  "reverses",
  "stops",
  "becomes",
  "stays",
]);

function candidateFromAnswer(rawAnswer: string): string | null {
  const stripped = rawAnswer.trim().replace(/^(the|a|an)\s+/i, "");
  if (!stripped) return null;
  // Formulas, fractions, percentages, and parenthetical asides don't read
  // as search terms even when short (e.g. "Mass × acceleration", "g/mol").
  if (/[×÷=→%/(),]/.test(stripped)) return null;
  if (/^\d/.test(stripped)) return null;

  const words = stripped.split(/\s+/);
  if (words.length > 4) return null;
  if (EXACT_BLACKLIST.has(stripped.toLowerCase())) return null;
  if (GENERIC_LEADING_VERBS.has(words[0].toLowerCase())) return null;

  return titleCase(stripped);
}

// Ordered longest-phrase-first so e.g. "newton's second law" matches before
// a hypothetical bare "newton" entry would. Deliberately a fixed list, not
// exhaustive — it's a fallback/supplementary signal alongside the
// correct-answer extraction above and the sub-topic name fallback below,
// not the sole source of keywords.
const GLOSSARY: [string, string][] = [
  ["newton's first law", "Newton's First Law"],
  ["newton's second law", "Newton's Second Law"],
  ["newton's third law", "Newton's Third Law"],
  ["ohm's law", "Ohm's Law"],
  ["avogadro's number", "Avogadro's Number"],
  ["relative atomic mass", "Relative Atomic Mass"],
  ["molar mass", "Molar Mass"],
  ["hydrostatic pressure", "Hydrostatic Pressure"],
  ["principle of moments", "Principle of Moments"],
  ["moment of a force", "Moment of a Force"],
  ["turning effect", "Turning Effect"],
  ["equilibrium of forces", "Equilibrium of Forces"],
  ["resultant force", "Resultant Force"],
  ["uniform acceleration", "Uniform Acceleration"],
  ["velocity-time graph", "Velocity-Time Graph"],
  ["static friction", "Static Friction"],
  ["rate of reaction", "Rate of Reaction"],
  ["redox reaction", "Redox Reaction"],
  ["displacement reaction", "Displacement Reaction"],
  ["chemical change", "Chemical Change"],
  ["physical change", "Physical Change"],
  ["chemical symbol", "Chemical Symbol"],
  ["covalent bond", "Covalent Bond"],
  ["ionic bond", "Ionic Bond"],
  ["metallic bond", "Metallic Bond"],
  ["catalyst", "Catalyst"],
  ["oxidation", "Oxidation"],
  ["reduction", "Reduction"],
  ["combustion", "Combustion"],
  ["neutralization", "Neutralization"],
  ["precipitate", "Precipitate"],
  ["decomposition", "Decomposition"],
  ["photosynthesis", "Photosynthesis"],
  ["chlorophyll", "Chlorophyll"],
  ["mitochondria", "Mitochondria"],
  ["mitochondrion", "Mitochondria"],
  ["cell wall", "Cell Wall"],
  ["cell membrane", "Cell Membrane"],
  ["genetic material", "Genetic Material"],
  ["living organisms", "Living Organisms"],
  ["metabolic waste", "Metabolic Waste"],
  ["punnett square", "Punnett Square"],
  ["genetic cross", "Genetic Cross"],
  ["sexual reproduction", "Sexual Reproduction"],
  ["asexual reproduction", "Asexual Reproduction"],
  ["boiling point", "Boiling Point"],
  ["continents", "Continents"],
  ["sun rises", "Directions"],
  ["water", "Water"],
];

const GLOSSARY_PATTERNS: [RegExp, string][] = GLOSSARY.map(([phrase, keyword]) => [
  new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "i"),
  keyword,
]);

function hasKeywordCaseInsensitive(keywords: string[], candidate: string): boolean {
  const lower = candidate.toLowerCase();
  return keywords.some((k) => k.toLowerCase() === lower);
}

export type KeywordExtractionInput = {
  questionText: string;
  correctAnswerText: string | null;
  subTopicName: string | null;
};

// Returns 0-3 keywords, in priority order: (1) the correct answer, when it
// reads as a short noun phrase rather than a full clause or formula — but
// never for a "which of the following is NOT..." question, where the
// correct answer is the odd one out and would tag the question with an
// unrelated concept; (2) any curated glossary phrase found in the question
// text itself; (3) the question's own sub-topic name, as a broad fallback,
// when there's still room and a sub-topic exists (untagged paper questions
// have none). An empty result means the caller should flag the question for
// manual review rather than leaving it silently untagged.
export function extractKeywords(input: KeywordExtractionInput, limit = 3): string[] {
  const { questionText, correctAnswerText, subTopicName } = input;
  const keywords: string[] = [];

  const isNotQuestion = /\bNOT\b/.test(questionText);
  if (!isNotQuestion && correctAnswerText) {
    const answerKeyword = candidateFromAnswer(correctAnswerText);
    if (answerKeyword) keywords.push(answerKeyword);
  }

  for (const [pattern, keyword] of GLOSSARY_PATTERNS) {
    if (keywords.length >= limit) break;
    if (pattern.test(questionText) && !hasKeywordCaseInsensitive(keywords, keyword)) {
      keywords.push(keyword);
    }
  }

  if (keywords.length < limit && subTopicName && !hasKeywordCaseInsensitive(keywords, subTopicName)) {
    keywords.push(subTopicName);
  }

  return keywords.slice(0, limit);
}
