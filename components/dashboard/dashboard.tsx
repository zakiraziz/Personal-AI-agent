"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { ComingSoon } from "@/components/dashboard/placeholder";
import { WelcomeBanner } from "@/components/dashboard/welcome-banner";
import { Statistics } from "@/components/dashboard/statistics";
import { ViewsChart } from "@/components/dashboard/views-chart";
import { RecentContent } from "@/components/dashboard/recent-content";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { ComingSoonDialog } from "@/components/ui/coming-soon-dialog";
import { StoryStudio } from "@/components/story-studio/story-studio";
import { CharacterStudio } from "@/components/character-studio/character-studio";
import type { CharacterProfile } from "@/lib/character-studio/types";
import type { SavedStory } from "@/lib/story-studio/service";
import type { YouTubeChannelRow } from "@/lib/supabase/database.types";
import type {
  YouTubeAnalyticsDailyRow,
  YouTubeVideoRow,
} from "@/lib/supabase/database.types";
import Link from "next/link";
import { ChannelAvatar } from "@/components/dashboard/channel-avatar";
import { SyncNowButton } from "@/components/dashboard/sync-now-button";
import { AIAssistant } from "@/components/dashboard/ai-assistant";
import { ThumbnailStudio } from "@/components/dashboard/thumbnail-studio";

export function Dashboard({
  characters,
  displayName,
  email,
  stories,
  youtubeChannel,
  videos,
  analytics,
}: {
  characters: CharacterProfile[];
  displayName: string;
  email: string;
  stories: SavedStory[];
  youtubeChannel: YouTubeChannelRow | null;
  videos: YouTubeVideoRow[];
  analytics: YouTubeAnalyticsDailyRow[];
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activePage, setActivePage] = useState("Overview");
  const [comingSoonTitle, setComingSoonTitle] = useState<string | null>(null);

  function navigate(page: string) {
    if (page === "Settings") {
      router.push("/account");
      return;
    }
    setActivePage(page);
    setMenuOpen(false);
  }

  return (
    <div className="min-h-screen">
      <Sidebar
        activePage={activePage}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNavigate={navigate}
        youtubeChannel={youtubeChannel}
      />
      <div className="min-h-screen lg:pl-[264px]">
        <Topbar
          activePage={activePage}
          displayName={displayName}
          email={email}
          onMenuClick={() => setMenuOpen(true)}
        />
        <main className="mx-auto max-w-[1500px] px-5 pb-12 pt-7 sm:px-8 sm:pt-9 xl:px-10">
          {activePage === "Overview" ? (
            <div className="animate-rise-in">
              <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h1 className="text-[23px] font-semibold tracking-[-0.035em] text-white sm:text-[27px]">
                    Good to see you, {displayName || "Creator"}{" "}
                    <span aria-hidden="true">✦</span>
                  </h1>
                  <p className="mt-1.5 text-[13px] text-slate-400">
                    Here&apos;s what&apos;s happening in your studio today.
                  </p>
                </div>
                {youtubeChannel ? (
                  <div className="flex flex-wrap items-center justify-end gap-2.5">
                    <ChannelAvatar
                      name={youtubeChannel.channel_name}
                      thumbnailUrl={youtubeChannel.thumbnail_url}
                      size={30}
                    />
                    <span className="max-w-40 truncate text-[11px] font-medium text-slate-300">
                      {youtubeChannel.channel_name}
                    </span>
                    <SyncNowButton />
                    <form action="/api/youtube/disconnect" method="post">
                      <button
                        type="submit"
                        className="rounded-lg border border-white/[0.08] px-3 py-2 text-[10px] font-medium text-slate-300 transition hover:border-rose-300/25 hover:text-rose-200"
                      >
                        Disconnect
                      </button>
                    </form>
                  </div>
                ) : (
                  <Link
                    href="/api/youtube/connect"
                    className="rounded-lg border border-violet-300/20 bg-violet-300/[0.08] px-3.5 py-2 text-[11px] font-medium text-violet-100 transition hover:bg-violet-300/[0.14]"
                  >
                    Connect YouTube
                  </Link>
                )}
              </div>
              <div className="space-y-6">
                <WelcomeBanner channel={youtubeChannel} />
                <Statistics channel={youtubeChannel} />
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(350px,0.95fr)]">
                  <ViewsChart analytics={analytics} />
                  <QuickActions
                    onAction={(action) => {
                      if (action === "Write a Story") {
                        navigate("Story Studio");
                      } else if (action === "Generate Thumbnail") {
                        setComingSoonTitle(action);
                      } else {
                        setComingSoonTitle(action);
                      }
                    }}
                  />
                </div>
                <RecentContent videos={videos} />
              </div>
            </div>
          ) : activePage === "Story Studio" ? (
            <StoryStudio initialStories={stories} />
          ) : activePage === "AI Assistant" ? (
            <AIAssistant />
          ) : activePage === "Character Studio" ? (
            <CharacterStudio initialCharacters={characters} />
          ) : activePage === "Thumbnail Studio" ? (
            <ThumbnailStudio onPromptGenerated={() => setComingSoonTitle(null)} />
          ) : (
            <ComingSoon page={activePage} />
          )}
        </main>
      </div>
      {comingSoonTitle && (
        <ComingSoonDialog
          title={comingSoonTitle}
          onClose={() => setComingSoonTitle(null)}
        />
      )}
    </div>
  );
}
