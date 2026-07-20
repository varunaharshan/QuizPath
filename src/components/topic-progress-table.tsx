"use client";

import { Fragment, useState } from "react";
import Link from "next/link";

// Local types, not imported from @/lib/dashboard — that module transitively
// imports @/db (server-only-guarded), so a Client Component importing it at
// runtime would fail at build time. Mirrors the same "thin Client Component,
// plain precomputed data" pattern <TopicCardGrid>/<PapersGrid> established.
export type SubTopicStatusLabel = "mastered" | "in_progress" | "needs_work" | "not_started";

export type SubTopicProgressData = {
  id: string;
  name: string;
  questionsAnswered: number;
  correctCount: number;
  score: number | null;
  label: SubTopicStatusLabel;
};

export type TopicProgressData = SubTopicProgressData & {
  // The owning module's own grade — compared against `primaryGrade` below
  // to decide whether this row needs a "Grade 10" tag (a row from the
  // Include-Grade-10 toggle) or not (an ordinary same-grade row).
  grade: string;
  subTopics: SubTopicProgressData[];
};

const BAR_COLOR: Record<SubTopicStatusLabel, string> = {
  mastered: "bg-mastered",
  in_progress: "bg-progress",
  needs_work: "bg-warn",
  not_started: "bg-app-surface-muted",
};

const SCORE_TEXT_COLOR: Record<SubTopicStatusLabel, string> = {
  mastered: "text-mastered",
  in_progress: "text-progress",
  needs_work: "text-warn",
  not_started: "text-ink-muted",
};

function ProgressBar({ label, score }: { label: SubTopicStatusLabel; score: number | null }) {
  return (
    <div className="h-[7px] w-40 overflow-hidden rounded-full bg-app-surface-muted">
      <div className={`h-full rounded-full ${BAR_COLOR[label]}`} style={{ width: `${score ?? 0}%` }} />
    </div>
  );
}

// One row per Topic (module), aggregated across every sub-topic it contains
// — never a bare sub-topic as its own top-level row. Collapsed by default;
// clicking a topic row reveals its own sub-topic breakdown underneath, with
// the same Questions/Correct/Score columns scoped to just that sub-topic.
// The "Practice" link only ever makes sense at sub-topic granularity (there's
// no pooled "practice this whole topic" quiz mode in this app), so it lives
// only on the expanded sub-topic rows, not the topic row itself.
export function TopicProgressTable({
  topics,
  primaryGrade,
}: {
  topics: TopicProgressData[];
  // The page's own grade context (e.g. the student's profile grade, or
  // whichever grade a Grade/Subject filter has selected) — a topic row only
  // gets a "Grade 10" tag when its own grade differs from this, so a native
  // Grade 10 view (every row's grade already equals primaryGrade) never
  // shows the tag on its own rows.
  primaryGrade: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(topicId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) {
        next.delete(topicId);
      } else {
        next.add(topicId);
      }
      return next;
    });
  }

  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr className="bg-app-surface-muted text-left text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
          <th className="px-3.5 py-2.5">#</th>
          <th className="px-3.5 py-2.5">Topic</th>
          <th className="px-3.5 py-2.5">Progress</th>
          <th className="px-3.5 py-2.5 text-right">Questions</th>
          <th className="px-3.5 py-2.5 text-right">Correct</th>
          <th className="px-3.5 py-2.5 text-right">Score</th>
          <th className="px-3.5 py-2.5" />
        </tr>
      </thead>
      <tbody>
        {topics.map((topic, index) => {
          const isExpanded = expanded.has(topic.id);
          return (
            <Fragment key={topic.id}>
              <tr
                onClick={() => toggle(topic.id)}
                className="cursor-pointer border-b border-app-border last:border-b-0 hover:bg-app-surface-muted"
              >
                <td className="px-3.5 py-2.5 font-semibold text-ink-muted">{index + 1}</td>
                <td className="px-3.5 py-2.5 min-w-[180px] font-semibold">
                  <span className="mr-1.5 inline-block w-3 text-ink-muted">{isExpanded ? "▾" : "▸"}</span>
                  {topic.name}
                  {topic.grade !== primaryGrade && (
                    <span className="ml-2 rounded-full bg-app-surface-muted px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-secondary">
                      Grade {topic.grade}
                    </span>
                  )}
                </td>
                <td className="px-3.5 py-2.5">
                  <ProgressBar label={topic.label} score={topic.score} />
                </td>
                <td className="px-3.5 py-2.5 text-right text-ink-secondary">{topic.questionsAnswered}</td>
                <td className="px-3.5 py-2.5 text-right text-ink-secondary">{topic.correctCount}</td>
                <td className={`px-3.5 py-2.5 text-right font-bold ${SCORE_TEXT_COLOR[topic.label]}`}>
                  {topic.score === null ? "—" : `${topic.score}%`}
                </td>
                <td className="px-3.5 py-2.5" />
              </tr>
              {isExpanded &&
                topic.subTopics.map((subTopic) => (
                  <tr key={subTopic.id} className="border-b border-app-border bg-app-bg last:border-b-0">
                    <td className="px-3.5 py-2" />
                    <td className="px-3.5 py-2 pl-9 text-ink-secondary">{subTopic.name}</td>
                    <td className="px-3.5 py-2">
                      <ProgressBar label={subTopic.label} score={subTopic.score} />
                    </td>
                    <td className="px-3.5 py-2 text-right text-ink-secondary">{subTopic.questionsAnswered}</td>
                    <td className="px-3.5 py-2 text-right text-ink-secondary">{subTopic.correctCount}</td>
                    <td className={`px-3.5 py-2 text-right font-bold ${SCORE_TEXT_COLOR[subTopic.label]}`}>
                      {subTopic.score === null ? "—" : `${subTopic.score}%`}
                    </td>
                    <td className="px-3.5 py-2 text-right">
                      <Link
                        href={`/quiz/${subTopic.id}`}
                        className="rounded-md border border-app-border bg-white px-3.5 py-1.5 text-[12.5px] font-semibold hover:bg-app-surface-muted"
                      >
                        Practice
                      </Link>
                    </td>
                  </tr>
                ))}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
