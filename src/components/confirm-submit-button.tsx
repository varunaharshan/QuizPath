"use client";

import type { ReactNode } from "react";

// The one piece of client JS a destructive admin action needs: a plain
// window.confirm() gate before the surrounding <form>'s Server Action
// submits, matching the same "don't add more friction than that one step"
// precedent already used for the quiz-taking partial-submit confirm (see
// CLAUDE.md "Quiz-taking flow") rather than building a custom modal.
export function ConfirmSubmitButton({
  confirmMessage,
  className,
  children,
  ...props
}: {
  confirmMessage: string;
  className?: string;
  children: ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type" | "children" | "className">) {
  return (
    <button
      {...props}
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
