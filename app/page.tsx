import { listCharacters } from "@/lib/character-studio/service";
import { requireAuthorizedUser } from "@/lib/auth/user";
import { listSavedStories } from "@/lib/story-studio/service";
import { Dashboard } from "@/components/dashboard/dashboard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAnalyticsDateRange } from "@/lib/youtube/sync-data";
import type {
  YouTubeAnalyticsDailyRow,
  YouTubeVideoRow,
} from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { supabase, user } = await requireAuthorizedUser();
  const [characters, stories, profileResult] = await Promise.all([
    listCharacters(supabase, user.id),
    listSavedStories(supabase, user.id),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle(),
  ]);
  const { data: userScopedChannel, error: youtubeChannelError } = await supabase
    .from("youtube_channels")
    .select(
      "id, owner_id, youtube_channel_id, channel_name, thumbnail_url, custom_url, subscriber_count, hidden_subscriber_count, view_count, video_count, created_at, updated_at, description, country_code, published_at, synced_at",
    )
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const { startDate } = getAnalyticsDateRange();

  if (profileResult.error) {
    throw new Error(`Could not load your profile: ${profileResult.error.message}`);
  }

  if (youtubeChannelError) {
    throw new Error(
      `Could not load your YouTube channel: ${youtubeChannelError.message}`,
    );
  }

  let youtubeChannel = userScopedChannel;
  let videos: YouTubeVideoRow[] = [];
  let analytics: YouTubeAnalyticsDailyRow[] = [];
  if (!youtubeChannel && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    const admin = createAdminClient();
    const { data: ownedChannel, error: adminChannelError } = await admin
      .from("youtube_channels")
      .select(
        "id, owner_id, youtube_channel_id, channel_name, thumbnail_url, custom_url, subscriber_count, hidden_subscriber_count, view_count, video_count, created_at, updated_at, description, country_code, published_at, synced_at",
      )
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (adminChannelError) {
      throw new Error(
        `Could not verify your YouTube channel: ${adminChannelError.message}`,
      );
    }

    if (ownedChannel) {
      console.warn(
        "YouTube channel was not visible through the user-scoped query; loaded it with the verified owner ID.",
      );
      youtubeChannel = ownedChannel;
    }
  }

  if (youtubeChannel) {
    const [videoResult, analyticsResult] = await Promise.all([
      supabase
        .from("youtube_videos")
        .select(
          "id, owner_id, channel_id, youtube_video_id, title, description, thumbnail_url, published_at, duration_seconds, privacy_status, view_count, like_count, comment_count, synced_at, created_at, updated_at",
        )
        .eq("owner_id", user.id)
        .eq("channel_id", youtubeChannel.id)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(8),
      supabase
        .from("youtube_analytics_daily")
        .select(
          "id, owner_id, channel_id, report_date, views, watch_time_minutes, average_view_duration_seconds, subscribers_gained, subscribers_lost, synced_at, created_at",
        )
        .eq("owner_id", user.id)
        .eq("channel_id", youtubeChannel.id)
        .gte("report_date", startDate)
        .order("report_date", { ascending: true }),
    ]);

    if (videoResult.error) {
      throw new Error(`Could not load your YouTube videos: ${videoResult.error.message}`);
    }
    if (analyticsResult.error) {
      throw new Error(
        `Could not load your YouTube analytics: ${analyticsResult.error.message}`,
      );
    }

    videos = videoResult.data;
    analytics = analyticsResult.data;

    if (
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
      (!videos.length || !analytics.length)
    ) {
      const admin = createAdminClient();
      const [ownedVideosResult, ownedAnalyticsResult] = await Promise.all([
        videos.length
          ? Promise.resolve({ data: videos, error: null })
          : admin
              .from("youtube_videos")
              .select(
                "id, owner_id, channel_id, youtube_video_id, title, description, thumbnail_url, published_at, duration_seconds, privacy_status, view_count, like_count, comment_count, synced_at, created_at, updated_at",
              )
              .eq("owner_id", user.id)
              .eq("channel_id", youtubeChannel.id)
              .order("published_at", { ascending: false, nullsFirst: false })
              .limit(8),
        analytics.length
          ? Promise.resolve({ data: analytics, error: null })
          : admin
              .from("youtube_analytics_daily")
              .select(
                "id, owner_id, channel_id, report_date, views, watch_time_minutes, average_view_duration_seconds, subscribers_gained, subscribers_lost, synced_at, created_at",
              )
              .eq("owner_id", user.id)
              .eq("channel_id", youtubeChannel.id)
              .gte("report_date", startDate)
              .order("report_date", { ascending: true }),
      ]);

      if (ownedVideosResult.error) {
        throw new Error(
          `Could not verify your YouTube videos: ${ownedVideosResult.error.message}`,
        );
      }
      if (ownedAnalyticsResult.error) {
        throw new Error(
          `Could not verify your YouTube analytics: ${ownedAnalyticsResult.error.message}`,
        );
      }
      videos = ownedVideosResult.data;
      analytics = ownedAnalyticsResult.data;
    }
  }

  if (!profileResult.data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 text-slate-100">
        <h1 className="text-xl font-semibold">Profile setup required</h1>
        <p className="mt-2 text-sm text-slate-400">
          Your profile is unavailable for this account. Contact the project
          administrator to restore profile access.
        </p>
      </main>
    );
  }

  return (
    <Dashboard
      characters={characters}
      displayName={profileResult.data.display_name}
      email={user.email ?? ""}
      stories={stories}
      youtubeChannel={youtubeChannel}
      videos={videos}
      analytics={analytics}
    />
  );
}
