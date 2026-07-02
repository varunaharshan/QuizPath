import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { masteryScores, modules, quizAttempts, subTopics } from "@/db/schema";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";

function masteryLabel(score: string | null): "Not started" | "Needs work" | "Mastered" {
  if (score === null) return "Not started";
  const value = Number(score);
  if (value >= 80) return "Mastered";
  if (value < 60) return "Needs work";
  return "Needs work";
}

export default async function DashboardPage() {
  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/sign-in");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  const gradeModules = await db.query.modules.findMany({
    where: eq(modules.grade, profile.grade),
    orderBy: modules.sortOrder,
    with: {
      subTopics: {
        orderBy: subTopics.sortOrder,
      },
    },
  });

  const scores = await db
    .select()
    .from(masteryScores)
    .where(eq(masteryScores.studentId, appUser.id));
  const scoreBySubTopic = new Map(scores.map((s) => [s.subTopicId, s.score]));

  const inProgressAttempt = await db.query.quizAttempts.findFirst({
    where: and(eq(quizAttempts.studentId, appUser.id), isNull(quizAttempts.completedAt)),
    orderBy: desc(quizAttempts.startedAt),
  });

  const completedAttempts = await db.query.quizAttempts.findMany({
    where: and(eq(quizAttempts.studentId, appUser.id)),
    orderBy: desc(quizAttempts.completedAt),
    limit: 20,
  });
  const completedOnly = completedAttempts.filter((a) => a.completedAt !== null);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Grade {profile.grade} · Science</p>
        </div>
        <UserButton />
      </header>

      <section>
        <h2 className="text-lg font-medium">Continue where you left off</h2>
        <div className="mt-3 rounded-lg border border-black/10 p-5 dark:border-white/15">
          {inProgressAttempt ? (
            <p>You have a quiz in progress.</p>
          ) : (
            <p className="text-zinc-500 dark:text-zinc-400">
              No quiz in progress. Pick a sub-topic below to get started.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium">Progress by sub-topic</h2>
        <div className="mt-3 flex flex-col gap-4">
          {gradeModules.map((module) => (
            <div key={module.id} className="rounded-lg border border-black/10 p-5 dark:border-white/15">
              <h3 className="font-medium">{module.name}</h3>
              <ul className="mt-3 flex flex-col gap-2">
                {module.subTopics.map((subTopic) => (
                  <li
                    key={subTopic.id}
                    className="flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-300"
                  >
                    <span>{subTopic.name}</span>
                    <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-medium dark:bg-white/10">
                      {masteryLabel(scoreBySubTopic.get(subTopic.id) ?? null)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium">Completed quizzes</h2>
        <div className="mt-3 rounded-lg border border-black/10 p-5 dark:border-white/15">
          {completedOnly.length === 0 ? (
            <p className="text-zinc-500 dark:text-zinc-400">
              You haven&apos;t completed any quizzes yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {completedOnly.map((attempt) => (
                <li key={attempt.id} className="flex justify-between text-sm">
                  <span>{attempt.completedAt?.toLocaleDateString()}</span>
                  <span>{attempt.score ?? "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
