import type { ReactNode } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

// Deliberately a separate component from src/components/app-shell.tsx — no
// shared imports, no reuse of the student sidebar's markup/nav data. Kept
// minimal since Topics is the only admin section today; add more nav items
// to ADMIN_NAV_ITEMS as more /admin/* sections are built, the same way
// AppShell's own nav list grows.
const ADMIN_NAV_ITEMS = [{ href: "/admin/topics", label: "Topics", icon: "▤" }] as const;

export function AdminShell({ adminName, children }: { adminName: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-app-bg text-ink">
      <header className="flex h-[52px] items-center bg-navy-900 px-5">
        <span className="mr-7 text-[15px] font-bold text-white">QuizPath Admin</span>
        <div className="flex-1" />
        <span className="mr-3 text-[13px] text-white/70">{adminName}</span>
        <UserButton
          appearance={{
            elements: {
              avatarBox: "h-[30px] w-[30px] rounded-full ring-2 ring-gold-500",
            },
          }}
        />
      </header>

      <div className="flex flex-1">
        <nav className="w-[200px] shrink-0 border-r border-app-border bg-white p-2.5">
          <p className="mx-2.5 mb-1.5 mt-1 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
            Content
          </p>
          {ADMIN_NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="mb-0.5 flex items-center gap-2.5 rounded-md border-l-[3px] border-progress bg-progress-bg px-2.5 py-2 text-[13.5px] font-semibold text-progress"
            >
              <span className="w-[18px] shrink-0 text-center text-[15px]">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="max-w-[900px] flex-1 p-7">{children}</main>
      </div>
    </div>
  );
}
