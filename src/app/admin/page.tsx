import { redirect } from "next/navigation";

// The Admin Dashboard is now the landing page for /admin/*.
export default function AdminIndexPage() {
  redirect("/admin/dashboard");
}
