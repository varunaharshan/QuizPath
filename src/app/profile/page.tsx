import { redirect } from "next/navigation";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { getCompletedQuizzes, getSubTopicStatusesForGrade } from "@/lib/dashboard";
import { AppShell } from "@/components/app-shell";
import { updateGrade } from "./actions";

export default async function ProfilePage() {
  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  const [statuses, completedQuizzes] = await Promise.all([
    getSubTopicStatusesForGrade(appUser.id, profile.grade),
    getCompletedQuizzes(appUser.id),
  ]);

  const practiceCount = statuses.filter((s) => s.label !== "mastered").length;
  const displayName = appUser.name ?? appUser.email.split("@")[0];

  return (
    <AppShell
      active="profile"
      studentName={displayName}
      grade={profile.grade}
      practiceCount={practiceCount}
      isActiveLearner={completedQuizzes.length > 0}
    >
      <form
        action={updateGrade}
        className="mb-4.5 overflow-hidden rounded-[10px] border border-app-border bg-white"
      >
        <div className="border-b border-app-border px-4.5 py-3.5 text-[13.5px] font-bold text-navy-900">
          Account details
        </div>
        <div className="flex flex-col gap-3.5 p-4">
          <div>
            <label className="mb-1.5 block text-[11.5px] font-bold uppercase tracking-wide text-ink-secondary">
              Name
            </label>
            <input
              type="text"
              value={displayName}
              readOnly
              className="w-full max-w-[360px] rounded-md border border-app-border bg-app-bg px-2.5 py-2 text-[13.5px] text-ink"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11.5px] font-bold uppercase tracking-wide text-ink-secondary">
              Email
            </label>
            <input
              type="text"
              value={appUser.email}
              readOnly
              className="w-full max-w-[360px] rounded-md border border-app-border bg-app-bg px-2.5 py-2 text-[13.5px] text-ink"
            />
          </div>
          <div>
            <label
              htmlFor="grade"
              className="mb-1.5 block text-[11.5px] font-bold uppercase tracking-wide text-ink-secondary"
            >
              Grade
            </label>
            <select
              id="grade"
              name="grade"
              defaultValue={profile.grade}
              className="w-full max-w-[360px] rounded-md border border-app-border bg-white px-2.5 py-2 text-[13.5px] text-ink"
            >
              <option value="10">Grade 10</option>
              <option value="11">Grade 11</option>
            </select>
          </div>
          <button
            type="submit"
            className="w-fit rounded-md bg-navy-900 px-4.5 py-2 text-[13px] font-semibold text-white hover:bg-navy-800"
          >
            Save changes
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
        <div className="border-b border-app-border px-4.5 py-3.5 text-[13.5px] font-bold text-navy-900">
          Plan
        </div>
        <div className="flex max-w-[360px] items-center justify-between p-4">
          <div>
            <p className="m-0 text-[13.5px] font-semibold">Current plan</p>
            <p className="m-0 mt-0.5 text-xs text-ink-secondary">
              Free access during launch period
            </p>
          </div>
          <span className="rounded-full bg-mastered-bg px-2.5 py-0.5 text-[11.5px] font-semibold text-mastered">
            Free
          </span>
        </div>
      </div>
    </AppShell>
  );
}
