import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { getCompletedQuizzes, getSubTopicStatusesForGrade, iconForModule, iconForSubject } from "@/lib/dashboard";
import { getTopKeywords, groupTopicsBySubject, searchSubTopicIdsByKeyword } from "@/lib/practice";
import { AppShell } from "@/components/app-shell";
import { TopicCard } from "@/components/topic-card";

// A plain GET <form> (no client JS) — the search box just reloads this page
// with ?q=. Matching is a real search over the keywords backfill (see
// src/lib/practice.ts searchSubTopicIdsByKeyword) — sub-topic/module names
// and published question text still count too, but a question's own
// keywords tags are what let a search like "Microorganisms" surface a topic
// whose name never mentions the word. Results are grouped by subject then
// topic (src/lib/practice.ts groupTopicsBySubject), reusing the same
// <TopicCard> used by Practice by Topic, so a keyword spanning multiple
// topics shows each as its own card rather than merging them.
export default async function ByKeywordPage({
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
  const query = typeof params.q === "string" ? params.q.trim() : "";

  const [statuses, completedQuizzes, topKeywords] = await Promise.all([
    getSubTopicStatusesForGrade(appUser.id, profile.grade),
    getCompletedQuizzes(appUser.id),
    getTopKeywords(profile.grade),
  ]);

  const matchingIds = query ? await searchSubTopicIdsByKeyword(profile.grade, query) : null;
  const matchedGroups = matchingIds
    ? groupTopicsBySubject(statuses.filter((s) => matchingIds.has(s.id))).map((group) => ({
        subjectId: group.subjectId,
        subjectName: group.subjectName,
        topics: group.topics.map((topic) => ({
          id: topic.id,
          name: topic.name,
          moduleName: topic.moduleName,
          icon: iconForModule(topic.moduleName),
          score: topic.score,
          questionsAnswered: topic.questionsAnswered,
        })),
      }))
    : [];

  return (
    <AppShell
      active="practice-by-keyword"
      studentName={appUser.name ?? appUser.email.split("@")[0]}
      grade={profile.grade}
      isActiveLearner={completedQuizzes.length > 0}
    >
      <h1 className="m-0 mb-1 text-lg font-bold text-navy-900">Practice by Keyword</h1>
      <p className="m-0 mb-4.5 text-[13px] text-ink-secondary">
        Search for a keyword, or browse the top keywords below.
      </p>

      <form className="mb-4.5 flex max-w-[640px] gap-2.5">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Search e.g. Photosynthesis, Ohm's Law…"
          className="flex-1 rounded-md border border-app-border bg-white px-3 py-2 text-[13.5px] text-ink"
        />
        <button
          type="submit"
          className="rounded-md bg-navy-900 px-4.5 py-2 text-[13px] font-semibold text-white hover:bg-navy-800"
        >
          Search
        </button>
      </form>

      {!query ? (
        <div>
          <h2 className="m-0 mb-2.5 text-[13.5px] font-bold text-navy-900">Top Keywords</h2>
          {topKeywords.length === 0 ? (
            <p className="m-0 text-sm text-ink-secondary">No keywords are available yet for this grade.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {topKeywords.map((kw) => (
                <Link
                  key={kw.keyword}
                  href={`/practice/by-keyword?q=${encodeURIComponent(kw.keyword)}`}
                  className="rounded-full border border-app-border bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-ink hover:bg-app-surface-muted"
                >
                  {kw.keyword} <span className="font-normal text-ink-secondary">· {kw.count}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : matchedGroups.length === 0 ? (
        <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
          <p className="p-4 text-sm text-ink-secondary">No topics matched &quot;{query}&quot;.</p>
        </div>
      ) : (
        <div>
          {matchedGroups.map((group) => (
            <div key={group.subjectId} className="mb-4.5">
              <div className="mb-2.5 text-[13.5px] font-bold text-navy-900">
                {iconForSubject(group.subjectName)} {group.subjectName}
              </div>
              <div className="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
                {group.topics.map((topic) => (
                  <TopicCard key={topic.id} topic={topic} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
