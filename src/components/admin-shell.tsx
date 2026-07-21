import type { ReactNode } from "react";
import { UserButton } from "@clerk/nextjs";
import { AdminNavLinks } from "@/components/admin-nav-links";

// Deliberately a separate component from src/components/app-shell.tsx — no
// shared imports, no reuse of the student sidebar's markup/nav data. Nav
// items themselves live in admin-nav-links.tsx (a small "use client" piece
// so it can highlight the active item via usePathname()); add more entries
// there as more /admin/* sections are built, the same way AppShell's own
// nav list grows.

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
        <nav className="w-[200px] shrink-0 bg-navy p-2.5">
          <p className="mx-2.5 mb-1.5 mt-1 text-[11px] font-bold uppercase tracking-wide text-navy-nav-text">
            Content
          </p>
          <AdminNavLinks />
        </nav>

        <main className="flex-1 p-7">{children}</main>
      </div>
    </div>
  );
}
