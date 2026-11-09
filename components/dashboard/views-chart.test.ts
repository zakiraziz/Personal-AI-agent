import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ViewsChart } from "./views-chart";
import type { YouTubeAnalyticsDailyRow } from "@/lib/supabase/database.types";

const analytics: YouTubeAnalyticsDailyRow[] = [
  {
    id: "analytics-1",
    owner_id: "owner-1",
    channel_id: "channel-1",
    report_date: "2026-11-10",
    views: 450,
    watch_time_minutes: 120,
    average_view_duration_seconds: 16,
    subscribers_gained: 2,
    subscribers_lost: 0,
    synced_at: "2026-11-12T00:00:00.000Z",
    created_at: "2026-11-12T00:00:00.000Z",
  },
  {
    id: "analytics-2",
    owner_id: "owner-1",
    channel_id: "channel-1",
    report_date: "2026-11-11",
    views: 800,
    watch_time_minutes: 240,
    average_view_duration_seconds: 18,
    subscribers_gained: 3,
    subscribers_lost: 1,
    synced_at: "2026-11-12T00:00:00.000Z",
    created_at: "2026-11-12T00:00:00.000Z",
  },
];

describe("ViewsChart", () => {
  it("renders a clear empty state when analytics are unavailable", () => {
    const markup = renderToStaticMarkup(
      createElement(ViewsChart, { analytics: [] }),
    );

    expect(markup).toContain("No views in the last 30 days");
    expect(markup).toContain("Start uploading to see your analytics!");
    expect(markup).not.toContain("<svg role=\"img\"");
  });

  it("renders the chart and totals when analytics are available", () => {
    const markup = renderToStaticMarkup(
      createElement(ViewsChart, { analytics }),
    );

    expect(markup).toContain("1.3K");
    expect(markup).toContain(
      'aria-label="Daily YouTube views for 2 days, 1,250 total"',
    );
    expect(markup).toContain("<polyline");
    expect(markup).toContain(">11-10</text>");
    expect(markup).toContain(">11-11</text>");
  });
});
