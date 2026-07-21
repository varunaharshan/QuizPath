import type { ReactNode } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

export type ActiveNav = "dashboard" | "papers" | "weak-areas" | "by-topic" | "by-keyword" | "profile";

type NavItem = { key: ActiveNav; href: string; label: string; icon: string };

const TOP_NAV_ITEMS: (NavItem & { section: "Overview" | "Account" })[] = [
  { key: "dashboard", href: "/dashboard", label: "Dashboard", icon: "⌂", section: "Overview" },
  { key: "profile", href: "/profile", label: "Profile", icon: "◉", section: "Account" },
];

// Four flat, single-destination Learning items — Papers (Grade -> Subject ->
// Papers browsing), Weak Areas, By Topic (the topic-rollup mastery table,
// formerly "Progress"), and By Keyword. Previously the latter three sat
// indented under a non-clickable "Practice" section header; that grouping
// is gone, so all four are plain siblings under "Learning" now.
const LEARNING_ITEMS: NavItem[] = [
  { key: "papers", href: "/papers", label: "Papers", icon: "📄" },
  { key: "weak-areas", href: "/practice/weak-areas", label: "Weak areas", icon: "⚠" },
  { key: "by-topic", href: "/practice/by-topic", label: "By topic", icon: "▤" },
  { key: "by-keyword", href: "/practice/by-keyword", label: "By keyword", icon: "⌕" },
];

const SECTIONS = ["Overview", "Learning", "Account"] as const;

function NavLink({ item, active }: { item: NavItem; active: ActiveNav }) {
  const isActive = item.key === active;
  return (
    <Link
      href={item.href}
      className={`mb-0.5 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] transition-colors ${
        isActive
          ? "bg-navy-active font-semibold text-white shadow-[0_4px_12px_rgba(43,63,240,0.35)]"
          : "text-navy-nav-text hover:bg-navy-2 hover:text-white"
      }`}
    >
      <span className="w-[18px] shrink-0 text-center text-[15px]">{item.icon}</span>
      {item.label}
    </Link>
  );
}

export function AppShell({
  active,
  studentName,
  grade,
  isActiveLearner,
  children,
}: {
  active: ActiveNav;
  studentName: string;
  grade: string;
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
        <nav className="w-[210px] shrink-0 bg-navy p-2.5">
          {SECTIONS.map((section) => (
            <div key={section}>
              <p className="mx-2.5 mb-1.5 mt-3.5 text-[11px] font-bold uppercase tracking-wide text-navy-nav-text first:mt-1">
                {section}
              </p>
              {section === "Learning" ? (
                LEARNING_ITEMS.map((item) => <NavLink key={item.key} item={item} active={active} />)
              ) : (
                TOP_NAV_ITEMS.filter((item) => item.section === section).map((item) => (
                  <NavLink key={item.key} item={item} active={active} />
                ))
              )}
            </div>
          ))}
        </nav>

        <main className="min-w-0 flex-1 p-7">{children}</main>
      </div>
    </div>
  );
}
