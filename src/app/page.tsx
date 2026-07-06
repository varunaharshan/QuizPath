import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { BrandPanel } from "@/components/brand-panel";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { Logo } from "@/components/logo";

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    const appUser = await getOrCreateAppUser();
    if (appUser) {
      // Admins skip grade/medium onboarding entirely — that's a student-only
      // concept, so the role check runs before the student-profile lookup.
      if (appUser.role === "admin") {
        redirect("/admin");
      }
      const profile = await getStudentProfile(appUser.id);
      redirect(profile ? "/dashboard" : "/onboarding");
    }
  }

  return (
    <div className="grid min-h-screen flex-1 lg:grid-cols-2">
      <div className="hidden bg-navy-900 px-10 py-12 lg:flex lg:px-14">
        <BrandPanel />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <Logo />
          </div>

          <h1 className="mt-6 text-3xl font-bold tracking-tight text-navy-900">
            Welcome to QuizPath
          </h1>
          <p className="mt-1 text-zinc-500">
            Sign in to start practicing Grade 10/11 Science
          </p>

          <div className="mt-8">
            <GoogleSignInButton />
            <p className="mt-4 text-center text-xs text-zinc-400">
              Google is the only supported sign-in method for QuizPath.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
