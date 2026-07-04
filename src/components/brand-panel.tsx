import type { ReactNode } from "react";
import { Logo } from "./logo";

function StatBadge({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg bg-navy-800 px-3 py-4 text-center">
      <p className="text-2xl font-bold text-gold-400">{value}</p>
      <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-white/60">
        {label}
      </p>
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-white/80">
      {children}
    </span>
  );
}

// The navy marketing panel shown as the left column of the combined
// landing/sign-in split screen at "/".
export function BrandPanel() {
  return (
    <div className="flex h-full flex-col justify-between text-white">
      <div>
        <Logo />

        <h1 className="mt-8 max-w-md text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Grade 10/11 Science, <span className="text-gold-400">mastered</span> sub-topic by
          sub-topic.
        </h1>

        <p className="mt-6 max-w-md text-lg text-white/70">
          Free quiz practice for Grade 10 and 11 Science students. Pick a sub-topic, take a
          quiz, and see exactly what needs more work — no gamification gimmicks, no fluff.
        </p>

        <div className="mt-10 grid grid-cols-3 gap-3 sm:gap-4">
          <StatBadge value="10" label="Questions per quiz" />
          <StatBadge value="2" label="Grades covered" />
          <StatBadge value="Free" label="During early access" />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Pill>Instant scoring</Pill>
          <Pill>Sub-topic mastery tracking</Pill>
          <Pill>Google sign-in</Pill>
        </div>

        <div className="mt-8 rounded-xl border border-white/15 bg-navy-800 p-5">
          <p className="flex items-center gap-2 font-semibold text-gold-400">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M10 1.5 12.6 7l6 .9-4.3 4.2 1 6-5.3-2.8L4.7 18l1-6L1.4 7.9l6-.9L10 1.5Z" />
            </svg>
            Free during early access
          </p>
          <p className="mt-1 text-sm text-white/70">
            Sign in with Google and start practicing today — no credit card, ever, while
            we&apos;re in early access.
          </p>
        </div>
      </div>

      <p className="mt-10 text-xs text-white/40">© 2026 QuizPath</p>
    </div>
  );
}
