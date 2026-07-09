// One row per Topic (module), not a bare sub-topic — mirrors the
// topic-primary rule <TopicProgressTable> established for By Topic/Weak
// Areas (see CLAUDE.md "Dashboard"/"Practice"). No `moduleName` field here
// (unlike TopicCardData, which this used to reuse): at this grain the topic
// *is* the module, so a separate parent-module label would be redundant.
export type DashboardTopicRow = {
  id: string;
  name: string;
  icon: string;
  score: number | null;
  questionsAnswered: number;
};

// Plain accuracy table for the Dashboard's "Topic Performance" card — no
// subject-tab switcher of its own anymore (that control moved up to the
// page-level "Your subjects" switcher, see <DashboardSubjectSection>), so
// this needs no client state and isn't a Client Component at all: it just
// renders whichever single subject's topics it's handed. No per-row
// Practice link: a Topic row has no single quiz to launch (this app has no
// pooled multi-sub-topic quiz mode), the same reason <TopicProgressTable>
// only ever puts a Practice button on its expanded sub-topic rows — "View
// all topics →" below this table is the entry point into that drill-down.
export function DashboardTopicTable({ topics }: { topics: DashboardTopicRow[] }) {
  if (topics.length === 0) {
    return <p className="m-0 text-sm text-ink-secondary">No topics are available yet for this subject.</p>;
  }

  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr>
          <th className="border-b border-app-border pb-2.5 pr-2 text-left text-[11.5px] font-semibold uppercase tracking-wide text-ink-secondary">
            Topic
          </th>
          <th className="border-b border-app-border pb-2.5 pr-2 text-left text-[11.5px] font-semibold uppercase tracking-wide text-ink-secondary">
            Accuracy
          </th>
          <th className="border-b border-app-border pb-2.5 text-left text-[11.5px] font-semibold uppercase tracking-wide text-ink-secondary">
            Questions
          </th>
        </tr>
      </thead>
      <tbody>
        {topics.map((topic) => (
          <tr key={topic.id}>
            <td className="border-b border-app-border py-2.5 pr-2">
              {topic.icon} {topic.name}
            </td>
            <td className="border-b border-app-border py-2.5 pr-2">
              {topic.score === null ? (
                "—"
              ) : (
                <>
                  <span className="mr-2 inline-block h-[7px] w-[70px] overflow-hidden rounded-full bg-app-surface-muted align-middle">
                    <span
                      className="block h-full rounded-full bg-dash-green"
                      style={{ width: `${Math.round(topic.score)}%` }}
                    />
                  </span>
                  {topic.score}%
                </>
              )}
            </td>
            <td className="border-b border-app-border py-2.5">{topic.questionsAnswered}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
