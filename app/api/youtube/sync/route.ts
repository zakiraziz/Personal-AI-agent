import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedEmail } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import {
  decryptRefreshToken,
  encryptRefreshToken,
  YOUTUBE_OAUTH_SCOPES,
} from "@/lib/youtube/oauth";
import {
  fetchPaginatedYouTubeItems,
  getAnalyticsDateRange,
  parseAnalyticsReportDate,
  parseYouTubeDuration,
  upsertInChunks,
  YouTubeApiError,
} from "@/lib/youtube/sync-data";

type GoogleTokens = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
};

type GoogleChannel = {
  id?: string;
  contentDetails?: {
    relatedPlaylists?: {
      uploads?: string;
    };
  };
};

type GoogleThumbnail = { url?: string };

type GooglePlaylist = {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    thumbnails?: Record<string, GoogleThumbnail | undefined>;
  };
  contentDetails?: { itemCount?: number };
  status?: { privacyStatus?: string };
};

type GooglePlaylistItem = {
  contentDetails?: { videoId?: string };
};

type GoogleVideo = {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    thumbnails?: Record<string, GoogleThumbnail | undefined>;
  };
  contentDetails?: { duration?: string };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
  status?: { privacyStatus?: string };
};

type GoogleAnalyticsReport = {
  columnHeaders?: { name?: string }[];
  rows?: (string | number | null)[][];
};

type GooglePlaylistPrivacy = "public" | "unlisted" | "private";

function parseCount(value: string | number | undefined | null) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseMetric(value: string | number | null | undefined) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parsePrivacy(value: string | undefined): GooglePlaylistPrivacy | null {
  return value === "public" || value === "unlisted" || value === "private"
    ? value
    : null;
}

function thumbnailUrl(
  thumbnails: Record<string, GoogleThumbnail | undefined> | undefined,
) {
  return (
    thumbnails?.maxres?.url ??
    thumbnails?.standard?.url ??
    thumbnails?.high?.url ??
    thumbnails?.medium?.url ??
    thumbnails?.default?.url ??
    null
  );
}

async function fetchJson<T>(url: URL, accessToken: string, label: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new YouTubeApiError(`${label} failed (${response.status}).`, response.status);
  }
  return (await response.json()) as T;
}

function failure(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(_request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error("Could not verify the current user for YouTube sync.", authError);
    return failure("Could not verify your session.", 503);
  }
  if (!user) return failure("Sign in before syncing YouTube.", 401);
  if (!isAuthorizedEmail(user.email)) {
    return failure("Not authorized.", 403);
  }

  try {
    const admin = createAdminClient();
    const { data: tokenRow, error: tokenError } = await admin
      .schema("private")
      .from("youtube_oauth_tokens")
      .select("refresh_token_ciphertext")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (tokenError) {
      throw new Error(`Could not load YouTube credentials (${tokenError.message}).`);
    }
    if (!tokenRow) {
      return failure("Connect a YouTube channel before syncing.", 404);
    }

    const { data: channel, error: channelError } = await admin
      .from("youtube_channels")
      .select("id, youtube_channel_id")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (channelError) {
      throw new Error(`Could not load the connected channel (${channelError.message}).`);
    }
    if (!channel) {
      return failure("Connect a YouTube channel before syncing.", 404);
    }

    const refreshToken = decryptRefreshToken(tokenRow.refresh_token_ciphertext);
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      throw new Error(
        "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
      );
    }

    const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
    });
    if (!refreshResponse.ok) {
      const body = (await refreshResponse.json().catch(() => ({}))) as {
        error?: string;
      };
      if (body.error === "invalid_grant") {
        return failure(
          "Google authorization has expired or been revoked. Reconnect your YouTube account and grant access again.",
          401,
        );
      }
      throw new Error(`Google access-token refresh failed (${refreshResponse.status}).`);
    }

    const tokens = (await refreshResponse.json()) as GoogleTokens;
    if (!tokens.access_token) {
      throw new Error("Google token response did not contain an access token.");
    }
    if (
      tokens.scope &&
      !tokens.scope.split(" ").includes(YOUTUBE_OAUTH_SCOPES[3])
    ) {
      return failure(
        "YouTube Analytics access is missing. Reconnect your account and grant the Analytics permission.",
        403,
      );
    }

    const channelUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
    channelUrl.search = new URLSearchParams({
      part: "id,contentDetails",
      id: channel.youtube_channel_id,
      maxResults: "50",
    }).toString();
    const googleChannels = await fetchJson<{ items?: GoogleChannel[] }>(
      channelUrl,
      tokens.access_token,
      "YouTube channel verification",
    );
    const googleChannel = googleChannels.items?.find(
      (item) => item.id === channel.youtube_channel_id,
    );
    const uploadsPlaylistId = googleChannel?.contentDetails?.relatedPlaylists
      ?.uploads;
    if (!googleChannel || !uploadsPlaylistId) {
      return failure(
        "The connected YouTube channel is not available to this Google account. Reconnect and select the correct account.",
        403,
      );
    }

    const playlistsUrl = new URL("https://www.googleapis.com/youtube/v3/playlists");
    playlistsUrl.search = new URLSearchParams({
      part: "snippet,contentDetails,status",
      channelId: channel.youtube_channel_id,
      maxResults: "50",
    }).toString();
    const playlists = await fetchPaginatedYouTubeItems<GooglePlaylist>(
      playlistsUrl.toString(),
      tokens.access_token,
    );

    const playlistItemsUrl = new URL(
      "https://www.googleapis.com/youtube/v3/playlistItems",
    );
    playlistItemsUrl.search = new URLSearchParams({
      part: "contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: "50",
    }).toString();
    const playlistItems =
      await fetchPaginatedYouTubeItems<GooglePlaylistItem>(
        playlistItemsUrl.toString(),
        tokens.access_token,
      );
    const videoIds = Array.from(
      new Set(
        playlistItems
          .map((item) => item.contentDetails?.videoId)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const videos: GoogleVideo[] = [];
    for (let offset = 0; offset < videoIds.length; offset += 50) {
      const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
      videosUrl.search = new URLSearchParams({
        part: "snippet,contentDetails,statistics,status",
        id: videoIds.slice(offset, offset + 50).join(","),
        maxResults: "50",
      }).toString();
      const result = await fetchJson<{ items?: GoogleVideo[] }>(
        videosUrl,
        tokens.access_token,
        "YouTube video details",
      );
      if (result.items) videos.push(...result.items);
    }

    const { startDate, endDate } = getAnalyticsDateRange();
    const analyticsUrl = new URL(
      "https://youtubeanalytics.googleapis.com/v2/reports",
    );
    const analyticsQuery = {
      ids: "channel==MINE",
      startDate,
      endDate,
      dimensions: "day",
      metrics:
        "views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost",
      sort: "day",
    };
    analyticsUrl.search = new URLSearchParams(analyticsQuery).toString();
    let analytics: GoogleAnalyticsReport;
    try {
      analytics = await fetchJson<GoogleAnalyticsReport>(
        analyticsUrl,
        tokens.access_token,
        "YouTube Analytics report",
      );
    } catch (error) {
      if (error instanceof YouTubeApiError && error.status === 403) {
        return failure(
          "YouTube Analytics access was denied. Enable the YouTube Analytics API in Google Cloud, then reconnect and grant the Analytics permission.",
          403,
        );
      }
      throw error;
    }
    if (process.env.NODE_ENV !== "production") {
      console.info("YouTube Analytics API response.", {
        query: analyticsQuery,
        dateRange: { startDate, endDate },
        columnHeaders: analytics.columnHeaders ?? [],
        rows: analytics.rows ?? [],
      });
    }

    const refreshedAt = new Date().toISOString();

    const playlistRows = playlists
      .filter(
        (playlist): playlist is GooglePlaylist & {
          id: string;
          snippet: NonNullable<GooglePlaylist["snippet"]> & { title: string };
        } => Boolean(playlist.id && playlist.snippet?.title),
      )
      .map((playlist) => ({
        owner_id: user.id,
        channel_id: channel.id,
        youtube_playlist_id: playlist.id,
        title: playlist.snippet.title,
        description: playlist.snippet.description ?? "",
        thumbnail_url: thumbnailUrl(playlist.snippet.thumbnails),
        published_at: playlist.snippet.publishedAt ?? null,
        item_count: parseCount(playlist.contentDetails?.itemCount),
        privacy_status: parsePrivacy(playlist.status?.privacyStatus),
        synced_at: refreshedAt,
      }));

    const videoRows = videos
      .filter(
        (video): video is GoogleVideo & {
          id: string;
          snippet: NonNullable<GoogleVideo["snippet"]> & { title: string };
        } => Boolean(video.id && video.snippet?.title),
      )
      .map((video) => ({
        owner_id: user.id,
        channel_id: channel.id,
        youtube_video_id: video.id,
        title: video.snippet.title,
        description: video.snippet.description ?? "",
        thumbnail_url: thumbnailUrl(video.snippet.thumbnails),
        published_at: video.snippet.publishedAt ?? null,
        duration_seconds: parseYouTubeDuration(video.contentDetails?.duration),
        privacy_status: parsePrivacy(video.status?.privacyStatus),
        view_count: parseCount(video.statistics?.viewCount),
        like_count: parseCount(video.statistics?.likeCount),
        comment_count: parseCount(video.statistics?.commentCount),
        synced_at: refreshedAt,
      }));

    const headers = analytics.columnHeaders?.map((header) => header.name ?? "") ?? [];
    const columnIndex = (name: string) => headers.indexOf(name);
    const analyticsRows = (analytics.rows ?? [])
      .map((row) => {
        const dateIndex = columnIndex("day");
        const reportDate = dateIndex < 0 ? undefined : row[dateIndex];
        if (typeof reportDate !== "string") {
          return null;
        }
        const formattedDate = parseAnalyticsReportDate(reportDate);
        if (!formattedDate) return null;
        const metric = (name: string) => {
          const index = columnIndex(name);
          return index < 0 ? null : parseMetric(row[index]);
        };
        const views = metric("views");
        const subscribersGained = metric("subscribersGained");
        const subscribersLost = metric("subscribersLost");
        return {
          owner_id: user.id,
          channel_id: channel.id,
          report_date: formattedDate,
          views: views === null ? null : parseCount(views),
          watch_time_minutes: metric("estimatedMinutesWatched"),
          average_view_duration_seconds: metric("averageViewDuration"),
          subscribers_gained:
            subscribersGained === null ? null : parseCount(subscribersGained),
          subscribers_lost:
            subscribersLost === null ? null : parseCount(subscribersLost),
          synced_at: refreshedAt,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const tokenUpdate = tokens.refresh_token
      ? {
          refresh_token_ciphertext: encryptRefreshToken(tokens.refresh_token),
          last_refreshed_at: refreshedAt,
        }
      : { last_refreshed_at: refreshedAt };
    const { error: tokenUpdateError } = await admin
      .schema("private")
      .from("youtube_oauth_tokens")
      .update(tokenUpdate)
      .eq("owner_id", user.id);
    if (tokenUpdateError) {
      throw new Error(
        `Could not update YouTube credential metadata (${tokenUpdateError.message}).`,
      );
    }

    await upsertInChunks("youtube_playlists", playlistRows, (chunk) =>
      admin
        .from("youtube_playlists")
        .upsert(chunk, { onConflict: "owner_id,youtube_playlist_id" }),
    );
    await upsertInChunks("youtube_videos", videoRows, (chunk) =>
      admin
        .from("youtube_videos")
        .upsert(chunk, { onConflict: "owner_id,youtube_video_id" }),
    );
    await upsertInChunks(
      "youtube_analytics_daily",
      analyticsRows,
      (chunk) =>
        admin
          .from("youtube_analytics_daily")
          .upsert(chunk, { onConflict: "owner_id,channel_id,report_date" }),
    );

    return NextResponse.json({
      success: true,
      synced: {
        playlists: playlistRows.length,
        videos: videoRows.length,
        analyticsDays: analyticsRows.length,
      },
      analyticsDateRange: { startDate, endDate },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected YouTube sync failure.";
    console.error("YouTube sync failed.", error);
    return failure(message, 500);
  }
}
