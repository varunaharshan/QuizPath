import Link from "next/link";
import {
  getAdminContentCoverageBySubject,
  getAdminOverviewStats,
  getCoverageGaps,
  getGradesWithContent,
  getScopedKpis,
  getSubjectsWithContentForGrade,
} from "@/lib/admin-dashboard";
import { getTopicsForSubjectGrade } from "@/lib/admin-topics";
import { getGrades, labelForGrade } from "@/lib/reference-data";
import { AdminContentCoverageTable } from "@/components/admin-content-coverage-table";

function KpiCard({
  icon,
  label,
  value,
  href,
}: {
  icon: string;
  label: string;
  value: number | string;
  href?: string;
}) {
  const content = (
    <div className="flex items-center gap-3 rounded-[10px] border border-app-border bg-white p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-app-surface-muted text-[16px]">
        {icon}
      </span>
      <div>
        <p className="m-0 text-[12px] text-ink-secondary">{label}</p>
        <p className="m-0 text-lg font-bold text-navy-900">{value}</p>
      </div>
    </div>
  );

  if (!href) return content;
  return (
    <Link href={href} className="block transition-opacity hover:opacity-80">
      {content}
    </Link>
  );
}

function PillRow({
  items,
  activeValue,
  buildHref,
}: {
  items: { value: string; label: string }[];
  activeValue: string | undefined;
  buildHref: (value: string) => string;
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.value}
          href={buildHref(item.value)}
          className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
            item.value === activeValue
              ? "bg-navy-900 text-white"
              : "bg-app-surface-muted text-ink-secondary hover:bg-app-border"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const rawGrade = typeof params.grade === "string" ? params.grade : undefined;
  const rawSubjectId = typeof params.subjectId === "string" ? params.subjectId : undefined;

  // `grades` is the set that actually has content (modules or papers, any
  // status — see getGradesWithContent's own comment) and is what the pill
  // row/selection-validity check is driven by; `allGrades` is only needed to
  // resolve each shown grade's display label. This list can include "gcse"
  // once a paper is tagged that way — previously hardcoded to accept only
  // literal "10"/"11", which silently dropped a "gcse" pill click back to
  // the unscoped view even though getScopedKpis/getTopicsForSubjectGrade
  // already handle it correctly (see CLAUDE.md "GCSE / combined-grade topic
  // queries").
  const [grades, allGrades] = await Promise.all([getGradesWithContent(), getGrades()]);
  const grade = rawGrade && grades.includes(rawGrade) ? rawGrade : undefined;

  const subjects = grade ? await getSubjectsWithContentForGrade(grade) : [];
  const subjectId = grade && rawSubjectId && subjects.some((s) => s.id === rawSubjectId) ? rawSubjectId : undefined;

  const isScoped = Boolean(grade && subjectId);

  return (
    <>
      <div className="mb-4.5 flex items-end justify-between gap-3">
        <div>
          <h1 className="m-0 mb-1 text-xl font-bold text-navy-900">Admin Dashboard</h1>
          <p className="m-0 text-[13px] text-ink-secondary">Content and platform overview</p>
        </div>
      </div>

      <div className="mb-4.5">
        <PillRow
          items={grades.map((g) => ({ value: g, label: labelForGrade(g, allGrades) }))}
          activeValue={grade}
          buildHref={(g) => `/admin/dashboard?grade=${g}`}
        />
        {grade && (
          <PillRow
            items={subjects.map((s) => ({ value: s.id, label: s.name }))}
            activeValue={subjectId}
            buildHref={(s) => `/admin/dashboard?grade=${grade}&subjectId=${s}`}
          />
        )}
      </div>

      {isScoped && grade && subjectId ? (
        <ScopedView grade={grade} subjectId={subjectId} />
      ) : (
        <UnscopedView />
      )}
    </>
  );
}

async function UnscopedView() {
  const [stats, subjectCoverage] = await Promise.all([getAdminOverviewStats(), getAdminContentCoverageBySubject()]);
  const maxCount = Math.max(1, ...subjectCoverage.map((s) => s.questionCount));

  return (
    <>
      <div className="mb-4.5 grid grid-cols-4 gap-3">
        <KpiCard icon="❓" label="Total Questions" value={stats.totalQuestions.toLocaleString()} />
        <KpiCard icon="📄" label="Total Papers" value={stats.totalPapers} />
        <KpiCard
          icon="⏳"
          label="Pending Review"
          value={stats.pendingReview}
          href="/admin/dashboard/unverified"
        />
        <KpiCard icon="🧑‍🎓" label="Active Students" value={stats.activeStudents} />
      </div>

      <div className="max-w-[640px] rounded-[10px] border border-app-border bg-white p-5">
        <h2 className="m-0 mb-4 text-[15px] font-bold text-navy-900">Content Coverage by Subject</h2>
        {subjectCoverage.length === 0 ? (
          <p className="m-0 text-[13px] text-ink-secondary">No subjects exist yet.</p>
        ) : (
          <div className="flex flex-col gap-3.5">
            {subjectCoverage.map((subject) => (
              <div key={subject.subjectId}>
                <div className="mb-1 flex items-center justify-between text-[13px]">
                  <span className="font-medium text-navy-900">{subject.subjectName}</span>
                  <span className="text-ink-secondary">{subject.questionCount.toLocaleString()} questions</span>
                </div>
                <div className="h-2 w-full rounded-full bg-app-surface-muted">
                  <div
                    className="h-2 rounded-full bg-progress"
                    style={{
                      width: `${subject.questionCount === 0 ? 0 : Math.max(Math.round((subject.questionCount / maxCount) * 100), 4)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

async function ScopedView({ grade, subjectId }: { grade: string; subjectId: string }) {
  const topics = await getTopicsForSubjectGrade(subjectId, grade);
  const kpis = await getScopedKpis(subjectId, grade, topics);
  const gaps = getCoverageGaps(topics);

  return (
    <>
      <div className="mb-4.5 grid grid-cols-4 gap-3">
        <KpiCard icon="❓" label="Total Questions" value={kpis.totalQuestions.toLocaleString()} />
        <KpiCard
          icon="📚"
          label="Topics Covered"
          value={`${kpis.topicsCoveredCount}/${kpis.topicsTotalCount}`}
        />
        <KpiCard icon="⚠️" label="Empty Sub-topics" value={kpis.emptySubTopicCount} />
        <KpiCard icon="📄" label="Papers Using This Subject" value={kpis.papersUsingSubject} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h2 className="m-0 mb-3 text-[15px] font-bold text-navy-900">Content Coverage by Topic</h2>
          {topics.length === 0 ? (
            <div className="rounded-[10px] border border-app-border bg-white p-4 text-[13px] text-ink-secondary">
              No topics exist yet for this grade+subject.
            </div>
          ) : (
            <AdminContentCoverageTable topics={topics} />
          )}
        </div>

        <div>
          <h2 className="m-0 mb-3 text-[15px] font-bold text-navy-900">Coverage Gaps</h2>
          <div className="rounded-[10px] border border-app-border bg-white p-4">
            {gaps.length === 0 ? (
              <p className="m-0 text-[13px] text-ink-secondary">
                Every sub-topic has at least one question. Nice work!
              </p>
            ) : (
              <ul className="m-0 flex flex-col gap-2 pl-0 text-[13px]">
                {gaps.map((gap) => (
                  <li key={gap.subTopicId} className="flex items-center justify-between border-b border-app-border pb-2 last:border-b-0 last:pb-0">
                    <span className="text-navy-900">{gap.subTopicName}</span>
                    <span className="text-[11px] text-ink-muted">{gap.topicName}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
