"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Split out from admin-shell.tsx (a plain Server Component) purely to get
// active-state highlighting via usePathname() — the layout that renders
// AdminShell has no other way to know which child page is current. Kept
// minimal (just nav highlighting, no data fetching), the same
// single-purpose-client-wrapper pattern as ConfirmSubmitButton.
const ADMIN_NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/admin/topics", label: "Topics", icon: "▤" },
  { href: "/admin/papers", label: "Papers", icon: "📄" },
  { href: "/admin/questions/bulk-upload", label: "Questions", icon: "❓" },
] as const;

export function AdminNavLinks() {
  const pathname = usePathname();

  return (
    <>
      {ADMIN_NAV_ITEMS.map((item) => {
        const isActive = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              isActive
                ? "mb-0.5 flex items-center gap-2.5 rounded-md border-l-[3px] border-progress bg-progress-bg px-2.5 py-2 text-[13.5px] font-semibold text-progress"
                : "mb-0.5 flex items-center gap-2.5 rounded-md border-l-[3px] border-transparent px-2.5 py-2 text-[13.5px] font-semibold text-ink-secondary hover:bg-app-surface-muted"
            }
          >
            <span className="w-[18px] shrink-0 text-center text-[15px]">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
