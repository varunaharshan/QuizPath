import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { getQuizForSubTopic } from "@/lib/quiz";
import { submitQuiz } from "./actions";

export default async function QuizPage({
  params,
}: {
  params: Promise<{ subTopicId: string }>;
}) {
  const { subTopicId } = await params;

  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  const { subTopic, questions } = await getQuizForSubTopic(subTopicId);
  if (!subTopic) {
    notFound();
  }

  const submitWithSubTopic = submitQuiz.bind(null, subTopicId);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 p-8">
      <div>
        <Link href="/quiz" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
          ← Choose a different sub-topic
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{subTopic.name}</h1>
      </div>

      {questions.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">
          No questions are available for this sub-topic yet.
        </p>
      ) : (
        <form action={submitWithSubTopic} className="flex flex-col gap-8">
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
            Submit quiz
          </button>
        </form>
      )}
    </main>
  );
}
