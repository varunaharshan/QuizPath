import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { BrandPanel } from "@/components/brand-panel";

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    const appUser = await getOrCreateAppUser();
    if (appUser) {
      const profile = await getStudentProfile(appUser.id);
      redirect(profile ? "/dashboard" : "/onboarding");
    }
  }

  return (
    <main className="flex min-h-screen flex-1 flex-col bg-navy-900">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16 sm:px-10">
        <BrandPanel
          cta={
            <Link
              href="/sign-in"
              className="mt-8 inline-flex w-fit items-center gap-2 rounded-full bg-gold-500 px-6 py-3 font-semibold text-navy-950 transition-colors hover:bg-gold-400"
            >
              Sign in with Google →
            </Link>
          }
        />
      </div>
    </main>
  );
}
