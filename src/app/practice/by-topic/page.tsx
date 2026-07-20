import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { getCompletedQuizzes, getProgressStats, isProgressStatsEmpty, type TopicProgress } from "@/lib/dashboard";
import { getPracticeSubjects } from "@/lib/papers";
import { getGrades, isValidGrade } from "@/lib/reference-data";
import { AppShell } from "@/components/app-shell";
import { IncludeGrade10Toggle } from "@/components/include-grade10-toggle";
import { ProgressFilterForm } from "@/components/progress-filter-form";
import { TopicProgressTable, type TopicProgressData } from "@/components/topic-progress-table";

// <TopicProgressTable> is "use client" and deliberately defines its own
// local types rather than importing TopicProgress from @/lib/dashboard
// (which transitively imports the server-only-guarded @/db) — this remaps
// the Server Component's already-fetched data into that plain shape, the
// same pattern this app's other Client Components (e.g. <PapersGrid>)
// already established.
function toTopicProgressData(topic: TopicProgress): TopicProgressData {
  return {
    id: topic.id,
    name: topic.name,
    questionsAnswered: topic.questionsAnswered,
    correctCount: topic.correctCount,
    score: topic.score,
    label: topic.label,
    grade: topic.grade,
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

// Formerly "Progress" (at /progress) — renamed and simplified to just the
// Mastery by topic table. The 4 KPI cards (quizzes completed / questions
// answered / correct answers / average score) that used to sit above this
// table were dropped, not moved: the Dashboard's own stat row already shows
// the same 4 metric types (account-wide across every subject for the
// grade, via getOverallStats) — a deliberate decision, not an oversight, so
// this page can stay focused on topic browsing without duplicating numbers
// already visible elsewhere.
export default async function ByTopicPage({
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
  const includeGrade10 = params.includeGrade10 === "true";

  const [subjects, completedQuizzes, grades] = await Promise.all([
    getPracticeSubjects(),
    getCompletedQuizzes(appUser.id),
    getGrades(),
  ]);

  // Both filter values are free query-string choices (a Grade 11 student can
  // browse Grade 10 progress, same free-browsing rule Papers has), so
  // anything invalid just falls back to a sane default rather than 404ing.
  const grade = rawGrade && isValidGrade(rawGrade, grades) ? rawGrade : profile.grade;

  const subjectId =
    rawSubjectId && subjects.some((s) => s.id === rawSubjectId) ? rawSubjectId : (subjects[0]?.id ?? null);
  const subject = subjects.find((s) => s.id === subjectId) ?? null;

  const stats = subjectId ? await getProgressStats(appUser.id, grade, subjectId, includeGrade10) : null;
  const isEmpty = stats !== null && isProgressStatsEmpty(stats, includeGrade10);

  return (
    <AppShell
      active="by-topic"
      studentName={appUser.name ?? appUser.email.split("@")[0]}
      grade={profile.grade}
      isActiveLearner={completedQuizzes.length > 0}
    >
      <h1 className="m-0 mb-1 text-lg font-bold text-navy-900">By Topic</h1>
      <p className="m-0 mb-4.5 text-[13px] text-ink-secondary">
        See how you&apos;re doing, topic by topic.
      </p>

      {!subjectId || !subject || !stats ? (
        <div className="rounded-[10px] border border-app-border bg-white p-4 text-sm text-ink-secondary">
          No subjects are available yet.
        </div>
      ) : (
        <>
          <ProgressFilterForm
            grades={grades.map((g) => ({ value: g.value, label: g.label }))}
            subjects={subjects}
            selected={{ grade, subjectId }}
          />

          <IncludeGrade10Toggle
            checked={includeGrade10}
            href={`/practice/by-topic?${new URLSearchParams({
              grade,
              subjectId,
              ...(includeGrade10 ? {} : { includeGrade10: "true" }),
            }).toString()}`}
          />

          {isEmpty ? (
            <div className="rounded-[10px] border border-app-border bg-white p-4 text-sm text-ink-secondary">
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
            <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
              <div className="border-b border-app-border px-4.5 py-3.5 text-[13.5px] font-bold text-navy-900">
                Mastery by topic
              </div>
              <div className="overflow-x-auto">
                <TopicProgressTable topics={stats.topics.map(toTopicProgressData)} primaryGrade={grade} />
              </div>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
