import type { PaperAccuracyTrend } from "@/lib/dashboard";

// Matches the dash-* palette's stroke order (blue/green/purple/amber/red),
// cycling if there are ever more subjects than colors. Plain CSS variable
// references rather than Tailwind stroke-* utilities, since SVG presentation
// attributes accept any valid CSS <color> value directly.
const LINE_COLORS = [
  "var(--color-dash-blue)",
  "var(--color-dash-green)",
  "var(--color-dash-purple)",
  "var(--color-dash-amber)",
  "var(--color-dash-red)",
];

const WIDTH = 560;
const HEIGHT = 190;
const PADDING = 10;

function yFor(score: number): number {
  return HEIGHT - PADDING - (score / 100) * (HEIGHT - 2 * PADDING);
}

// Renders one point per completed PAPER attempt (src/lib/dashboard.ts
// getPaperAccuracyTrend) — deliberately restricted to full paper attempts,
// never sub-topic practice sessions — a plain Server Component, no client
// JS, since the chart is static once rendered. Each point is plotted at its
// own completion time on a continuous chronological x-axis (not a weekly
// bucket, and not a cumulative running average the way this chart used to
// work): x spans from the earliest to the latest completed paper attempt
// across every subject, y is that one attempt's own score. A subject with
// only one paper attempt so far still gets a real, single circle marker —
// a valid, honest state, not a "not enough data" placeholder — and if every
// plotted point happens to share the same timestamp (or there's truly only
// one point total), they collapse to the horizontal center rather than
// dividing by a zero time span.
export function SubjectAccuracyChart({ trends }: { trends: PaperAccuracyTrend[] }) {
  const allPoints = trends.flatMap((trend) => trend.points);
  if (allPoints.length === 0) {
    return (
      <p className="m-0 text-sm text-ink-secondary">
        No completed paper attempts yet — take a past paper to start seeing your trend here.
      </p>
    );
  }

  const times = allPoints.map((point) => point.completedAt.getTime());
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const span = maxTime - minTime;

  function xFor(time: number): number {
    return span === 0 ? WIDTH / 2 : PADDING + ((time - minTime) / span) * (WIDTH - 2 * PADDING);
  }

  const series = trends.map((trend) => ({
    ...trend,
    plotted: trend.points.map((point) => ({ x: xFor(point.completedAt.getTime()), y: yFor(point.score) })),
  }));

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height={HEIGHT} role="img" aria-label="Paper attempt score trend over time">
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = PADDING + fraction * (HEIGHT - 2 * PADDING);
          return <line key={fraction} x1={0} y1={y} x2={WIDTH} y2={y} stroke="var(--color-app-border)" />;
        })}
        {series.map((s, index) => {
          const color = LINE_COLORS[index % LINE_COLORS.length];
          return (
            <g key={s.subjectId}>
              {s.plotted.length > 1 && (
                <polyline
                  fill="none"
                  stroke={color}
                  strokeWidth={2.5}
                  points={s.plotted.map((p) => `${p.x},${p.y}`).join(" ")}
                />
              )}
              {s.plotted.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3} fill={color} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="mt-1.5 flex flex-wrap gap-4 text-xs text-ink-secondary">
        {trends.map((trend, index) => (
          <span key={trend.subjectId} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: LINE_COLORS[index % LINE_COLORS.length] }}
            />
            {trend.subjectName}
          </span>
        ))}
      </div>
    </div>
  );
}
