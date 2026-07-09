import type { QuestionOption } from "@/db/schema";

// Plain Server Component (no interactivity needed) shared by the paper
// questions list and the per-question edit page — options are always
// plain text now (per-option images were dropped), so this just renders
// the content directly.
export function QuestionOptionPreview({ option }: { option: QuestionOption }) {
  return <span>{option.content}</span>;
}
