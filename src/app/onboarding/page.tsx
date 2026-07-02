import { redirect } from "next/navigation";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { setGrade } from "./actions";

export default async function OnboardingPage() {
  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/sign-in");
  }

  const existingProfile = await getStudentProfile(appUser.id);
  if (existingProfile) {
    redirect("/dashboard");
  }

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to QuizPath</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Which grade are you in?
        </p>

        <form action={setGrade} className="mt-6 flex flex-col gap-3">
          <button
            type="submit"
            name="grade"
            value="10"
            className="rounded-lg border border-black/10 px-5 py-4 text-left font-medium transition-colors hover:bg-black/[.04] dark:border-white/15 dark:hover:bg-white/[.06]"
          >
            Grade 10
          </button>
          <button
            type="submit"
            name="grade"
            value="11"
            className="rounded-lg border border-black/10 px-5 py-4 text-left font-medium transition-colors hover:bg-black/[.04] dark:border-white/15 dark:hover:bg-white/[.06]"
          >
            Grade 11
          </button>
        </form>
      </div>
    </main>
  );
}
