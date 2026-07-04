import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { getSubTopicsForGrade } from "@/lib/quiz";

export default async function SelectSubTopicPage() {
  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  const gradeModules = await getSubTopicsForGrade(profile.grade);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 p-8">
      <div>
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Choose a sub-topic</h1>
        <p className="mt-1 text-zinc-500 dark:text-zinc-400">Grade {profile.grade} · Science</p>
      </div>

      <div className="flex flex-col gap-4">
        {gradeModules.map((module) => (
          <div key={module.id} className="rounded-lg border border-black/10 p-5 dark:border-white/15">
            <h2 className="font-medium">{module.name}</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {module.subTopics.map((subTopic) => (
                <li key={subTopic.id}>
                  <Link
                    href={`/quiz/${subTopic.id}`}
                    className="flex items-center justify-between rounded-md border border-black/10 px-4 py-3 text-sm hover:bg-black/[.03] dark:border-white/15 dark:hover:bg-white/[.05]"
                  >
                    {subTopic.name}
                    <span aria-hidden>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </main>
  );
}
