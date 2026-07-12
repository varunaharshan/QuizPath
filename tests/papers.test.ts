import { describe, expect, it } from "vitest";
import { groupPapersBySubject, type GradePaperCard } from "@/lib/papers";

function paperCard(overrides: Partial<GradePaperCard> = {}): GradePaperCard {
  return {
    id: "p1",
    title: "Test paper",
    subjectId: "s1",
    subjectName: "Science",
    paperType: "provincial",
    year: 2023,
    questionCount: 10,
    totalMarks: 20,
    timeLimitMinutes: null,
    status: "not_started",
    answeredCount: null,
    ...overrides,
  };
}

// Backs the Papers grid's subject-tab switcher: an already-fetched grade-wide
// paper list gets bucketed by subject, client-side tab-switching over the
// result (mirroring groupTopicsBySubject's own test coverage for Practice by
// Topic).
describe("groupPapersBySubject", () => {
  it("buckets papers by subject, preserving each subject's own order, sorted by subject name", () => {
    const papers = [
      paperCard({ id: "p1", subjectId: "s1", subjectName: "Science", title: "Paper A" }),
      paperCard({ id: "p2", subjectId: "s1", subjectName: "Science", title: "Paper B" }),
      paperCard({ id: "p3", subjectId: "s2", subjectName: "Business Studies", title: "Paper C" }),
    ];

    const groups = groupPapersBySubject(papers);

    expect(groups).toHaveLength(2);
    // Sorted by subject name, not by first-appearance order.
    expect(groups[0].subjectName).toBe("Business Studies");
    expect(groups[0].papers.map((p) => p.id)).toEqual(["p3"]);
    expect(groups[1].subjectName).toBe("Science");
    expect(groups[1].papers.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("returns an empty array for an empty input", () => {
    expect(groupPapersBySubject([])).toEqual([]);
  });
});
