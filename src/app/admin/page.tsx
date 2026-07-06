import { redirect } from "next/navigation";

// No standalone admin home yet — Topics is the only section, so land
// straight there rather than showing an empty landing page.
export default function AdminIndexPage() {
  redirect("/admin/topics");
}
