import type { ReactNode } from "react";
import { requireAdminUser } from "@/lib/current-app-user";
import { AdminShell } from "@/components/admin-shell";

// Guards every /admin/* route in one place — unlike the student side, which
// repeats getOrCreateAppUser()/redirect per page since each page needs
// different data alongside the check. Admin pages don't have that same
// per-page variance yet, so centralizing here means a new admin page can't
// forget the guard.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const appUser = await requireAdminUser();

  return <AdminShell adminName={appUser.name ?? appUser.email.split("@")[0]}>{children}</AdminShell>;
}
