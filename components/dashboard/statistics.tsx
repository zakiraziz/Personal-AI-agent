import { Eye, PlaySquare, Users } from "lucide-react";
import type { YouTubeChannelRow } from "@/lib/supabase/database.types";

function formatCount(value: number | null) {
  return value === null
    ? "—"
    : new Intl.NumberFormat("en", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value);
}

export function Statistics({
  channel,
}: {
  channel: YouTubeChannelRow | null;
}) {
  if (!channel) return null;

  const stats = [
    {
      label: "Total views",
      value: formatCount(channel.view_count),
      icon: Eye,
      iconStyle: "bg-violet-400/10 text-violet-300",
    },
    {
      label: "Subscribers",
      value: channel.hidden_subscriber_count
        ? "Hidden"
        : formatCount(channel.subscriber_count),
      icon: Users,
      iconStyle: "bg-blue-400/10 text-blue-300",
    },
    {
      label: "Videos published",
      value: formatCount(channel.video_count),
      icon: PlaySquare,
      iconStyle: "bg-emerald-400/10 text-emerald-300",
    },
  ];

  return (
    <section
      aria-label="Channel statistics"
      className="grid gap-3 sm:grid-cols-3"
    >
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <article
            key={stat.label}
            className="group relative overflow-hidden rounded-xl border border-white/[0.07] bg-surface p-4 transition duration-200 hover:-translate-y-0.5 hover:border-white/[0.13] hover:bg-[#121b2f] sm:p-[18px]"
            style={{ animationDelay: `${index * 45}ms` }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-medium text-slate-400">
                  {stat.label}
                </p>
                <p className="mt-2 text-[25px] font-semibold leading-none tracking-[-0.04em] text-white">
                  {stat.value}
                </p>
              </div>
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${stat.iconStyle}`}
              >
                <Icon size={16} />
              </div>
            </div>
            <p className="mt-4 text-[10px] text-slate-500">
              From your connected YouTube channel
            </p>
          </article>
        );
      })}
    </section>
  );
}
