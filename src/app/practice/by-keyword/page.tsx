import { redirect } from "next/navigation";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { getCompletedQuizzes, getSubTopicStatusesForGrade } from "@/lib/dashboard";
import { searchSubTopicIdsByKeyword } from "@/lib/practice";
import { AppShell } from "@/components/app-shell";
import { TopicPracticeList } from "@/components/topic-practice-list";

// A plain GET <form> (no client JS) — the search box just reloads this page
// with ?q=, which is enough for a simple substring search with no live
// suggestions/autocomplete. See src/lib/practice.ts for what "keyword
// search" actually means here: existing sub-topic/module names and
// published question text, not a dedicated keyword taxonomy (none exists
// in the schema).
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

  const [statuses, completedQuizzes] = await Promise.all([
    getSubTopicStatusesForGrade(appUser.id, profile.grade),
    getCompletedQuizzes(appUser.id),
  ]);

  // No query yet: browse every topic, same as By Topic — a useful default
  // rather than an empty page, and matches the mockup's persistent topic
  // list that's visible before any search is run.
  const matchingIds = query ? await searchSubTopicIdsByKeyword(profile.grade, query) : null;
  const results = matchingIds ? statuses.filter((s) => matchingIds.has(s.id)) : statuses;

  return (
    <AppShell
      active="practice-by-keyword"
      studentName={appUser.name ?? appUser.email.split("@")[0]}
      grade={profile.grade}
      isActiveLearner={completedQuizzes.length > 0}
    >
      <h1 className="m-0 mb-1 text-lg font-bold text-navy-900">Practice by Keyword</h1>
      <p className="m-0 mb-4.5 text-[13px] text-ink-secondary">
        Search for a keyword, or browse every topic below.
      </p>

      <form className="mb-4.5 flex max-w-[640px] gap-2.5">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Search e.g. photosynthesis, Ohm's law…"
          className="flex-1 rounded-md border border-app-border bg-white px-3 py-2 text-[13.5px] text-ink"
        />
        <button
          type="submit"
          className="rounded-md bg-navy-900 px-4.5 py-2 text-[13px] font-semibold text-white hover:bg-navy-800"
        >
          Search
        </button>
      </form>

      <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
        <div className="border-b border-app-border px-4.5 py-3.5 text-[13.5px] font-bold text-navy-900">
          {query ? `Results for "${query}"` : "All topics"}
        </div>
        <TopicPracticeList
          topics={results}
          emptyMessage={query ? `No topics matched "${query}".` : "No topics are available yet for this grade."}
        />
      </div>
    </AppShell>
  );
}
