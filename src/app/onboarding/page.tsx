import { redirect } from "next/navigation";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { completeOnboarding } from "./actions";

const RADIO_CARD =
  "flex items-center gap-3 rounded-lg border border-black/10 px-5 py-4 text-left font-medium transition-colors hover:bg-black/[.04] has-[:checked]:border-black/40 has-[:checked]:bg-black/[.04] dark:border-white/15 dark:hover:bg-white/[.06] dark:has-[:checked]:border-white/40 dark:has-[:checked]:bg-white/[.06]";

export default async function OnboardingPage() {
  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
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
          A couple of quick questions before we get started.
        </p>

        <form action={completeOnboarding} className="mt-6 flex flex-col gap-6">
          <fieldset>
            <legend className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Which grade are you in?
            </legend>
            <div className="flex flex-col gap-3">
              <label className={RADIO_CARD}>
                <input type="radio" name="grade" value="10" required className="h-4 w-4" />
                Grade 10
              </label>
              <label className={RADIO_CARD}>
                <input type="radio" name="grade" value="11" required className="h-4 w-4" />
                Grade 11
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              What&apos;s your medium of instruction?
            </legend>
            <div className="flex flex-col gap-3">
              <label className={RADIO_CARD}>
                <input type="radio" name="medium" value="sinhala" required className="h-4 w-4" />
                Sinhala
              </label>
              <label className={RADIO_CARD}>
                <input type="radio" name="medium" value="tamil" required className="h-4 w-4" />
                Tamil
              </label>
              <label className={RADIO_CARD}>
                <input type="radio" name="medium" value="english" required className="h-4 w-4" />
                English
              </label>
            </div>
          </fieldset>

          <button
            type="submit"
            className="rounded-full bg-foreground px-6 py-3 font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Continue
          </button>
        </form>
      </div>
    </main>
  );
}
