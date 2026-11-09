import { Ghost } from "lucide-react";
import type { YouTubeAnalyticsDailyRow } from "@/lib/supabase/database.types";

const chartWidth = 640;
const chartHeight = 178;
const left = 38;
const right = 10;
const top = 14;
const bottom = 23;
const innerWidth = chartWidth - left - right;
const innerHeight = chartHeight - top - bottom;

function formatCount(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function ViewsChart({
  analytics,
}: {
  analytics: YouTubeAnalyticsDailyRow[];
}) {
  const total = analytics.reduce((sum, item) => sum + (item.views ?? 0), 0);
  const max = Math.max(1, ...analytics.map((item) => item.views ?? 0));
  const points = analytics.map((item, index) => ({
    date: item.report_date,
    views: item.views ?? 0,
    x:
      left +
      (innerWidth * index) / Math.max(analytics.length - 1, 1),
    y: top + innerHeight - ((item.views ?? 0) / max) * innerHeight,
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = points.length
    ? `${left},${top + innerHeight} ${line} ${left + innerWidth},${top + innerHeight}`
    : "";
  const labelStep = Math.max(1, Math.ceil(points.length / 6));

  return (
    <section
      aria-label="Daily YouTube views"
      className="min-h-[230px] rounded-xl border border-white/[0.07] bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold text-slate-100">
            Views over time
          </h2>
          {analytics.length ? (
            <div className="mt-2 flex items-baseline gap-2">
              <p className="text-[24px] font-semibold tracking-[-0.04em] text-white">
                {formatCount(total)}
              </p>
              <span className="text-[10px] text-slate-500">
                views · last {analytics.length} synced days
              </span>
            </div>
          ) : (
            <p className="mt-2 text-[10px] text-slate-500">
              Daily views · last 30 days
            </p>
          )}
        </div>
      </div>
      {analytics.length ? (
        <div className="mt-3 w-full">
          <svg
            role="img"
            aria-label={`Daily YouTube views for ${analytics.length} days, ${total.toLocaleString()} total`}
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="h-[175px] w-full overflow-visible"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="daily-views-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.24" />
                <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3].map((step) => {
              const y = top + (innerHeight * step) / 3;
              const value = (max * (3 - step)) / 3;
              return (
                <g key={step}>
                  <line
                    x1={left}
                    x2={chartWidth - right}
                    y1={y}
                    y2={y}
                    stroke="rgba(148,163,184,0.10)"
                    strokeDasharray={step === 3 ? "0" : "3 5"}
                  />
                  <text
                    x="0"
                    y={y + 3}
                    fill="#68748a"
                    fontSize="9"
                    fontFamily="Arial, sans-serif"
                  >
                    {formatCount(value)}
                  </text>
                </g>
              );
            })}
            <polygon points={area} fill="url(#daily-views-fill)" />
            <polyline
              points={line}
              fill="none"
              stroke="#9b7afa"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {points.map((point, index) =>
              index % labelStep === 0 || index === points.length - 1 ? (
                <g key={point.date}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="3"
                    fill="#b4a1ff"
                    stroke="#101729"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={point.x}
                    y={chartHeight - 3}
                    fill="#68748a"
                    fontSize="9"
                    textAnchor="middle"
                    fontFamily="Arial, sans-serif"
                  >
                    {point.date.slice(5)}
                  </text>
                </g>
              ) : null,
            )}
          </svg>
        </div>
      ) : (
        <div className="relative flex min-h-[165px] flex-col items-center justify-center overflow-hidden rounded-lg py-6 text-center">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute h-28 w-28 rounded-full bg-violet-500/[0.08] blur-2xl"
          />
          <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-300/[0.12] bg-violet-400/[0.08] text-violet-200 shadow-[0_0_32px_rgba(139,92,246,0.12)]">
            <Ghost size={21} strokeWidth={1.7} />
          </span>
          <p className="relative mt-3 text-[12px] font-medium text-slate-200">
            No views in the last 30 days
          </p>
          <p className="relative mt-1 max-w-xs text-[10px] leading-5 text-slate-500">
            Start uploading to see your analytics!
          </p>
        </div>
      )}
    </section>
  );
}
