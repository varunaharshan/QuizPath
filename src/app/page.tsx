import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";

export default async function Home() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/sign-in");
  }

  const profile = await getStudentProfile(appUser.id);
  redirect(profile ? "/dashboard" : "/onboarding");
}
