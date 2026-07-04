import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { ensurePaperAttemptStarted, getQuizForPaper } from "@/lib/quiz";
import { submitPaperQuiz } from "./actions";

export default async function PaperQuizPage({
  params,
}: {
  params: Promise<{ paperId: string }>;
}) {
  const { paperId } = await params;

  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  const { paper, questions } = await getQuizForPaper(paperId);
  if (!paper) {
    notFound();
  }

  // Marks the paper as "in progress" the moment the student opens it, so a
  // later visit to Practice offers "Resume" instead of "Start" if they never
  // submit.
  await ensurePaperAttemptStarted(appUser.id, paperId);

  const submitWithPaper = submitPaperQuiz.bind(null, paperId);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 p-8">
      <div>
        <Link
          href={`/quiz/grade/${paper.grade}/subjects/${paper.subjectId}`}
          className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
        >
          ← Choose a different paper
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{paper.title}</h1>
      </div>

      {questions.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">
          No questions are available for this paper yet.
        </p>
      ) : (
        <form action={submitWithPaper} className="flex flex-col gap-8">
          {questions.map((question, index) => (
            <fieldset
              key={question.id}
              className="rounded-lg border border-black/10 p-5 dark:border-white/15"
            >
              <legend className="px-1 text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Question {index + 1} of {questions.length}
              </legend>
              <p className="mt-1 font-medium">{question.questionText}</p>
              <div className="mt-4 flex flex-col gap-2">
                {question.options.map((option, optionIndex) => (
                  <label
                    key={optionIndex}
                    className="flex items-center gap-3 rounded-md border border-black/10 px-4 py-3 text-sm hover:bg-black/[.03] dark:border-white/15 dark:hover:bg-white/[.05]"
                  >
                    <input
                      type="radio"
                      name={`mcq:${question.id}`}
                      value={optionIndex}
                      required
                      className="h-4 w-4"
                    />
                    {option}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <button
            type="submit"
            className="rounded-full bg-foreground px-6 py-3 font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Submit paper
          </button>
        </form>
      )}
    </main>
  );
}
