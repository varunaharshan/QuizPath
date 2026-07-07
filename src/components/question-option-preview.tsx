import type { QuestionOption } from "@/db/schema";

// Plain Server Component (no interactivity needed) shared by the paper
// questions list and the per-question edit page, so "how a text-or-image
// option renders as a preview" stays defined in one place.
export function QuestionOptionPreview({ option }: { option: QuestionOption }) {
  if (option.type === "image") {
    return (
      <a
        href={option.content}
        target="_blank"
        rel="noreferrer"
        className="font-semibold text-progress underline"
      >
        [Image]
      </a>
    );
  }
  return <span>{option.content}</span>;
}
