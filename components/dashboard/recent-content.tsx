import Image from "next/image";
import { Play } from "lucide-react";
import type { YouTubeVideoRow } from "@/lib/supabase/database.types";

function formatCount(value: number | null) {
  return value === null
    ? "—"
    : new Intl.NumberFormat("en", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value);
}

function formatPublishedAt(value: string | null) {
  if (!value) return "Publish date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Publish date unavailable"
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

export function RecentContent({ videos }: { videos: YouTubeVideoRow[] }) {
  return (
    <section className="rounded-xl border border-white/[0.07] bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-4 sm:px-5">
        <div>
          <h2 className="text-[13px] font-semibold text-slate-100">
            Recent content
          </h2>
          <p className="mt-1 text-[10px] text-slate-500">
            Your latest videos from the connected YouTube channel.
          </p>
        </div>
        <span className="rounded-full border border-white/[0.07] px-2.5 py-1 text-[9px] text-slate-500">
          {videos.length} {videos.length === 1 ? "video" : "videos"}
        </span>
      </div>
      {videos.length ? (
        <div className="divide-y divide-white/[0.05]">
          {videos.map((video) => (
            <article
              key={video.youtube_video_id}
              className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.015] sm:gap-4 sm:px-5"
            >
              <div className="relative h-12 w-[76px] shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] sm:h-[52px] sm:w-[86px]">
                {video.thumbnail_url ? (
                  <Image
                    src={video.thumbnail_url}
                    alt=""
                    fill
                    unoptimized
                    sizes="86px"
                    className="object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-violet-500/30 to-blue-500/20" />
                )}
                <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/50">
                  <Play size={9} fill="white" className="ml-0.5 text-white" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium text-slate-200 sm:text-xs">
                  {video.title}
                </p>
                <p className="mt-1 text-[9px] capitalize text-slate-500">
                  {video.privacy_status ?? "Video"} ·{" "}
                  {formatPublishedAt(video.published_at)}
                </p>
              </div>
              <div className="min-w-[68px] text-right">
                <p className="text-[11px] text-slate-300">
                  {formatCount(video.view_count)}
                </p>
                <p className="mt-1 text-[9px] text-slate-600">views</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="px-5 py-10 text-center">
          <p className="text-[12px] font-medium text-slate-300">
            No videos synced yet
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            Use Sync Now to import videos from your channel.
          </p>
        </div>
      )}
    </section>
  );
}
