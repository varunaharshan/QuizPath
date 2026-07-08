import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { getCompletedQuizzes, getProgressStats, type TopicProgress } from "@/lib/dashboard";
import { getPracticeSubjects, isValidGrade } from "@/lib/papers";
import { AppShell } from "@/components/app-shell";
import { ProgressFilterForm } from "@/components/progress-filter-form";
import { TopicProgressTable, type TopicProgressData } from "@/components/topic-progress-table";

const GRADES = [
  { value: "10", label: "Grade 10" },
  { value: "11", label: "Grade 11" },
] as const;

// <TopicProgressTable> is "use client" and deliberately defines its own
// local types rather than importing TopicProgress from @/lib/dashboard
// (which transitively imports the server-only-guarded @/db) — this remaps
// the Server Component's already-fetched data into that plain shape, the
// same pattern the Practice by Topic page already established for
// <TopicCardGrid>.
function toTopicProgressData(topic: TopicProgress): TopicProgressData {
  return {
    id: topic.id,
    name: topic.name,
    questionsAnswered: topic.questionsAnswered,
    correctCount: topic.correctCount,
    score: topic.score,
    label: topic.label,
    subTopics: topic.subTopics.map((subTopic) => ({
      id: subTopic.id,
      name: subTopic.name,
      questionsAnswered: subTopic.questionsAnswered,
      correctCount: subTopic.correctCount,
      score: subTopic.score,
      label: subTopic.label,
    })),
  };
}

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  const params = await searchParams;
  const rawGrade = typeof params.grade === "string" ? params.grade : undefined;
  const rawSubjectId = typeof params.subjectId === "string" ? params.subjectId : undefined;

  // Both filter values are free query-string choices (a Grade 11 student can
  // browse Grade 10 progress, same free-browsing rule Papers has), so
  // anything invalid just falls back to a sane default rather than 404ing.
  const grade = rawGrade && isValidGrade(rawGrade) ? rawGrade : profile.grade;

  const [subjects, completedQuizzes] = await Promise.all([
    getPracticeSubjects(),
    getCompletedQuizzes(appUser.id),
  ]);

  const subjectId =
    rawSubjectId && subjects.some((s) => s.id === rawSubjectId) ? rawSubjectId : (subjects[0]?.id ?? null);
  const subject = subjects.find((s) => s.id === subjectId) ?? null;

  const stats = subjectId ? await getProgressStats(appUser.id, grade, subjectId) : null;

  return (
    <AppShell
      active="progress"
      studentName={appUser.name ?? appUser.email.split("@")[0]}
      grade={profile.grade}
      isActiveLearner={completedQuizzes.length > 0}
    >
      <h1 className="m-0 mb-1 text-lg font-bold text-navy-900">Progress</h1>
      <p className="m-0 mb-4.5 text-[13px] text-ink-secondary">
        See how you&apos;re doing, topic by topic.
      </p>

      {!subjectId || !subject || !stats ? (
        <div className="max-w-[640px] rounded-[10px] border border-app-border bg-white p-4 text-sm text-ink-secondary">
          No subjects are available yet.
        </div>
      ) : (
        <>
          <ProgressFilterForm grades={GRADES.map((g) => ({ ...g }))} subjects={subjects} selected={{ grade, subjectId }} />

          {stats.quizzesCompleted === 0 ? (
            <div className="max-w-[640px] rounded-[10px] border border-app-border bg-white p-4 text-sm text-ink-secondary">
              You haven&apos;t tried any Grade {grade} {subject.name} papers yet —{" "}
              <Link
                href={`/papers?grade=${grade}&subjectId=${subjectId}`}
                className="font-medium text-progress underline"
              >
                head to Papers
              </Link>{" "}
              to get started.
            </div>
          ) : (
            <>
              <div className="mb-4.5 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
                <div className="rounded-[10px] border border-app-border border-t-[3px] border-t-progress bg-white p-4">
                  <p className="m-0 mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
                    Quizzes completed
                  </p>
                  <p className="m-0 text-[24px] font-bold text-progress">{stats.quizzesCompleted}</p>
                </div>
                <div className="rounded-[10px] border border-app-border border-t-[3px] border-t-teal bg-white p-4">
                  <p className="m-0 mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
                    Total questions answered
                  </p>
                  <p className="m-0 text-[24px] font-bold text-teal">{stats.totalQuestionsAnswered}</p>
                </div>
                <div className="rounded-[10px] border border-app-border border-t-[3px] border-t-mastered bg-white p-4">
                  <p className="m-0 mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
                    Total correct answers
                  </p>
                  <p className="m-0 text-[24px] font-bold text-mastered">{stats.totalCorrectAnswers}</p>
                </div>
                <div className="rounded-[10px] border border-app-border border-t-[3px] border-t-warn bg-white p-4">
                  <p className="m-0 mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
                    Average score
                  </p>
                  <p className="m-0 text-[24px] font-bold text-warn">
                    {stats.averageScore === null ? "—" : `${Math.round(stats.averageScore)}%`}
                  </p>
                </div>
              </div>

              <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
                <div className="border-b border-app-border px-4.5 py-3.5 text-[13.5px] font-bold text-navy-900">
                  Mastery by topic
                </div>
                <div className="overflow-x-auto">
                  <TopicProgressTable topics={stats.topics.map(toTopicProgressData)} />
                </div>
              </div>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
