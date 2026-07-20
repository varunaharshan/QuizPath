"use client";

import { useRouter } from "next/navigation";

// One shared visual for the "Include Grade 10 foundational topics" toggle
// row, used identically on Weak Areas, By Topic, and the Dashboard's Topic
// Performance card — but each surface persists the toggle differently (see
// CLAUDE.md), so this supports two modes: `href` (a real navigation — the
// on/off href for the *other* state, used by the two URL-driven pages) or
// `onToggle` (a plain callback, used by the Dashboard's client-side subject
// switcher, which must not lose its own activeSubjectId state to a full
// page navigation). Exactly one of the two is passed by a given caller.
type Props = {
  checked: boolean;
} & ({ href: string; onToggle?: never } | { href?: never; onToggle: (next: boolean) => void });

export function IncludeGrade10Toggle({ checked, href, onToggle }: Props) {
  const router = useRouter();

  function handleChange(next: boolean) {
    if (onToggle) {
      onToggle(next);
    } else if (href !== undefined) {
      router.push(href);
    }
  }

  return (
    <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-[10px] border border-app-border bg-white p-3.5">
      <span className="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => handleChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="absolute inset-0 rounded-full bg-app-surface-muted transition-colors peer-checked:bg-progress" />
        <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
      <span>
        <span className="block text-[13.5px] font-semibold text-ink">Include Grade 10 foundational topics</span>
        <span className="block text-[12px] text-ink-secondary">
          Grade 11 papers often re-test Grade 10 content. Off by default — your Grade 11 topics stay exactly as they
          are today.
        </span>
      </span>
    </label>
  );
}
