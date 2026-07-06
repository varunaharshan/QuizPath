import type { SubjectAccuracyTrend } from "@/lib/dashboard";

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

function yFor(accuracy: number): number {
  return HEIGHT - PADDING - (accuracy / 100) * (HEIGHT - 2 * PADDING);
}

// Renders a real historical accuracy trend line per subject
// (src/lib/dashboard.ts getSubjectAccuracyTrends) — a plain Server
// Component, no client JS, since the chart is static once rendered.
// Weeks with no completed attempts yet simply carry forward the previous
// cumulative value rather than breaking the line, so a quiet week doesn't
// leave a visual gap; leading weeks before the student's first-ever
// attempt in that subject are omitted entirely rather than drawn at 0%.
export function SubjectAccuracyChart({ trends }: { trends: SubjectAccuracyTrend[] }) {
  if (trends.length === 0) {
    return (
      <p className="m-0 text-sm text-ink-secondary">
        No completed quizzes yet — practice a few to start seeing your trend here.
      </p>
    );
  }

  const pointCount = trends[0].points.length;
  const stepX = pointCount > 1 ? (WIDTH - 2 * PADDING) / (pointCount - 1) : 0;

  const series = trends.map((trend) => {
    let carried: number | null = null;
    const coords = trend.points
      .map((point, index) => {
        if (point.accuracy !== null) carried = point.accuracy;
        if (carried === null) return null;
        return `${PADDING + index * stepX},${yFor(carried)}`;
      })
      .filter((coord): coord is string => coord !== null);
    return { ...trend, coords: coords.join(" ") };
  });

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height={HEIGHT} role="img" aria-label="Subject accuracy trend over time">
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = PADDING + fraction * (HEIGHT - 2 * PADDING);
          return <line key={fraction} x1={0} y1={y} x2={WIDTH} y2={y} stroke="var(--color-app-border)" />;
        })}
        {series.map(
          (s, index) =>
            s.coords && (
              <polyline
                key={s.subjectId}
                fill="none"
                stroke={LINE_COLORS[index % LINE_COLORS.length]}
                strokeWidth={2.5}
                points={s.coords}
              />
            ),
        )}
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
