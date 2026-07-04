import type { ReactNode } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

export type ActiveNav = "dashboard" | "practice" | "progress" | "profile";

const NAV_ITEMS: {
  key: ActiveNav;
  href: string;
  label: string;
  icon: string;
  section: "Overview" | "Learning" | "Account";
}[] = [
  { key: "dashboard", href: "/dashboard", label: "Dashboard", icon: "⌂", section: "Overview" },
  { key: "practice", href: "/quiz", label: "Practice", icon: "✎", section: "Learning" },
  { key: "progress", href: "/progress", label: "Progress", icon: "☰", section: "Learning" },
  { key: "profile", href: "/profile", label: "Profile", icon: "◉", section: "Account" },
];

const SECTIONS = ["Overview", "Learning", "Account"] as const;

export function AppShell({
  active,
  studentName,
  grade,
  practiceCount,
  isActiveLearner,
  children,
}: {
  active: ActiveNav;
  studentName: string;
  grade: "10" | "11";
  practiceCount: number;
  isActiveLearner: boolean;
  children: ReactNode;
}) {
  const topTab = active === "profile" ? "settings" : "learn";

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-app-bg text-ink">
      <header className="flex h-[52px] items-center bg-navy-900 px-5">
        <span className="mr-7 text-[15px] font-bold text-white">QuizPath</span>

        <Link
          href="/dashboard"
          className={`mr-5 flex h-[52px] items-center gap-1.5 border-b-[3px] px-1 text-[13.5px] font-medium ${
            topTab === "learn"
              ? "border-gold-500 text-white"
              : "border-transparent text-white/65 hover:text-white/85"
          }`}
        >
          Learn
        </Link>
        <Link
          href="/profile"
          className={`flex h-[52px] items-center gap-1.5 border-b-[3px] px-1 text-[13.5px] font-medium ${
            topTab === "settings"
              ? "border-gold-500 text-white"
              : "border-transparent text-white/65 hover:text-white/85"
          }`}
        >
          Settings
        </Link>

        <div className="flex-1" />

        <UserButton
          appearance={{
            elements: {
              avatarBox: "h-[30px] w-[30px] rounded-full ring-2 ring-gold-500",
            },
          }}
        />
      </header>
      <div className="h-[3px] bg-gold-500" />

      <div className="flex flex-wrap items-baseline gap-2.5 border-b border-app-border bg-white px-6 py-3.5">
        <span className="text-base font-bold text-navy-900">{studentName}</span>
        <span className="text-ink-muted">·</span>
        <span className="text-[13px] text-ink-secondary">Grade {grade} · Science</span>
        <span className="rounded-full bg-app-surface-muted px-2.5 py-0.5 text-[11.5px] font-semibold text-ink-secondary">
          Free tier
        </span>
        {isActiveLearner && (
          <span className="rounded-full bg-mastered-bg px-2.5 py-0.5 text-[11.5px] font-semibold text-mastered">
            ✓ Active learner
          </span>
        )}
      </div>

      <div className="flex flex-1">
        <nav className="w-[210px] shrink-0 border-r border-app-border bg-white p-2.5">
          {SECTIONS.map((section) => (
            <div key={section}>
              <p className="mx-2.5 mb-1.5 mt-3.5 text-[11px] font-bold uppercase tracking-wide text-ink-muted first:mt-1">
                {section}
              </p>
              {NAV_ITEMS.filter((item) => item.section === section).map((item) => {
                const isActive = item.key === active;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`mb-0.5 flex items-center gap-2.5 rounded-md border-l-[3px] px-2.5 py-2 text-[13.5px] ${
                      isActive
                        ? "border-progress bg-progress-bg font-semibold text-progress"
                        : "border-transparent text-ink-secondary hover:bg-app-surface-muted"
                    }`}
                  >
                    <span className="w-[18px] shrink-0 text-center text-[15px]">{item.icon}</span>
                    {item.label}
                    {item.key === "practice" && practiceCount > 0 && (
                      <span
                        className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          isActive ? "bg-white text-progress" : "bg-app-surface-muted text-ink-secondary"
                        }`}
                      >
                        {practiceCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <main className="max-w-[900px] flex-1 p-7">{children}</main>
      </div>
    </div>
  );
}
