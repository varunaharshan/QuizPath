import { describe, expect, it } from "vitest";
import { extractKeywords } from "@/lib/keyword-extraction";

describe("extractKeywords", () => {
  it("prefers a clean, short correct-answer as the primary keyword", () => {
    const keywords = extractKeywords({
      questionText: "The removal of metabolic waste from an organism's body is called:",
      correctAnswerText: "Excretion",
      subTopicName: "Characteristics of organisms",
    });
    expect(keywords[0]).toBe("Excretion");
  });

  it("strips a leading article before titling the answer", () => {
    const keywords = extractKeywords({
      questionText: "The resultant of two forces acting at an angle to each other can be found using:",
      correctAnswerText: "The parallelogram law",
      subTopicName: "Resultant force",
    });
    expect(keywords[0]).toBe("Parallelogram Law");
  });

  it("rejects a full-clause answer and falls back to a glossary match in the question text", () => {
    const keywords = extractKeywords({
      questionText: "A physical change generally:",
      correctAnswerText: "Does not produce a new substance",
      subTopicName: "Changes in matter",
    });
    expect(keywords).not.toContain("Does Not Produce a New Substance");
    expect(keywords).toContain("Physical Change");
  });

  it("rejects a formula-shaped answer and falls back to a named-law glossary match", () => {
    const keywords = extractKeywords({
      questionText: "According to Newton's second law, force is equal to:",
      correctAnswerText: "Mass × acceleration",
      subTopicName: "Newton's laws of motion",
    });
    expect(keywords).not.toContain("Mass × Acceleration");
    expect(keywords[0]).toBe("Newton's Second Law");
  });

  it("never uses the correct answer for a 'which is NOT...' question, since it's the odd one out", () => {
    const keywords = extractKeywords({
      questionText: "Which of the following is NOT a characteristic of living organisms?",
      correctAnswerText: "Crystallization",
      subTopicName: "Characteristics of organisms",
    });
    expect(keywords).not.toContain("Crystallization");
    expect(keywords).toContain("Living Organisms");
  });

  it("falls back to the sub-topic name when nothing else is found, and caps at 3", () => {
    const keywords = extractKeywords({
      questionText: "A body starting from rest and moving with uniform acceleration covers a distance proportional to:",
      correctAnswerText: "Time squared",
      subTopicName: "Motion in a straight line",
    });
    expect(keywords.length).toBeLessThanOrEqual(3);
    expect(keywords).toContain("Uniform Acceleration");
    expect(keywords).toContain("Motion in a straight line");
  });

  it("matches a glossary phrase for an untagged question with no sub-topic at all", () => {
    const keywords = extractKeywords({
      questionText: "What is the boiling point of water at sea level, in °C?",
      correctAnswerText: "100",
      subTopicName: null,
    });
    expect(keywords).toContain("Boiling Point");
    expect(keywords).toContain("Water");
  });

  it("returns an empty array (flagged for manual review) when nothing matches at all", () => {
    const keywords = extractKeywords({
      questionText: "What is 2 + 2?",
      correctAnswerText: "4",
      subTopicName: null,
    });
    expect(keywords).toEqual([]);
  });

  it("preserves a formula-like answer's casing verbatim instead of mangling it (e.g. H2O, not H2o)", () => {
    const keywords = extractKeywords({
      questionText: "What is the chemical symbol for water?",
      correctAnswerText: "H2O",
      subTopicName: null,
    });
    expect(keywords).toContain("H2O");
  });

  it("never duplicates a keyword that would match both the answer and the sub-topic name", () => {
    const keywords = extractKeywords({
      questionText: "Melting of ice is an example of a:",
      correctAnswerText: "Physical change",
      subTopicName: "Physical change",
    });
    expect(keywords.filter((k) => k.toLowerCase() === "physical change")).toHaveLength(1);
  });
});
