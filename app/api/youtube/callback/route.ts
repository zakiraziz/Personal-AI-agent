import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAuthorizedEmail } from "@/lib/supabase/config";
import {
  encryptRefreshToken,
  verifyOAuthState,
  YOUTUBE_OAUTH_SCOPES,
} from "@/lib/youtube/oauth";

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

type GoogleUserInfo = {
  email?: string;
};

type YouTubeChannel = {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    customUrl?: string;
    publishedAt?: string;
    country?: string;
    thumbnails?: Record<string, { url?: string } | undefined>;
  };
  statistics?: {
    subscriberCount?: string;
    hiddenSubscriberCount?: boolean;
    viewCount?: string;
    videoCount?: string;
  };
};

type YouTubeThumbnails = NonNullable<
  NonNullable<YouTubeChannel["snippet"]>["thumbnails"]
>;

function parseCount(value: string | undefined) {
  return value && /^\d+$/.test(value) ? value : null;
}

function getThumbnailUrl(thumbnails: YouTubeThumbnails | undefined) {
  if (!thumbnails) return null;
  return (
    thumbnails.high?.url ??
    thumbnails.medium?.url ??
    thumbnails.default?.url ??
    null
  );
}

function failure(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  let stateOwnerId: string | null;
  try {
    stateOwnerId = verifyOAuthState(request.nextUrl.searchParams.get("state"));
  } catch (error) {
    console.error("Could not verify the YouTube OAuth state.", error);
    return failure("YouTube OAuth is not configured correctly.", 500);
  }
  if (!stateOwnerId) {
    return failure("OAuth state validation failed.", 400);
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code || request.nextUrl.searchParams.has("error")) {
    return failure("Google authorization was not completed.", 400);
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("Could not verify the current user during YouTube OAuth.", authError);
      return failure("Could not verify your session.", 503);
    }
    if (!user) return failure("Sign in before connecting YouTube.", 401);
    if (!isAuthorizedEmail(user.email)) {
      return failure("Not authorized.", 403);
    }
    if (user.id !== stateOwnerId) {
      return failure("The signed-in account changed during authorization.", 403);
    }

    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error(
        "Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.",
      );
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    });
    if (!tokenResponse.ok) {
      throw new Error(`Google token exchange failed (${tokenResponse.status}).`);
    }

    const tokens = (await tokenResponse.json()) as GoogleTokenResponse;
    if (!tokens.access_token) {
      throw new Error("Google token response did not contain an access token.");
    }

    const [userInfoResponse, channelsResponse] = await Promise.all([
      fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        cache: "no-store",
      }),
      fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet%2Cstatistics&mine=true",
        {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
          cache: "no-store",
        },
      ),
    ]);
    if (!userInfoResponse.ok) {
      throw new Error(`Google user profile request failed (${userInfoResponse.status}).`);
    }
    if (!channelsResponse.ok) {
      throw new Error(`YouTube channel request failed (${channelsResponse.status}).`);
    }

    const userInfo = (await userInfoResponse.json()) as GoogleUserInfo;
    const { items = [] } = (await channelsResponse.json()) as {
      items?: YouTubeChannel[];
    };
    const channels = items.filter(
      (channel): channel is YouTubeChannel & {
        id: string;
        snippet: NonNullable<YouTubeChannel["snippet"]> & { title: string };
      } => Boolean(channel.id && channel.snippet?.title),
    );
    if (!channels.length) {
      throw new Error("Google did not return a YouTube channel for this account.");
    }

    const admin = createAdminClient();
    let refreshTokenCiphertext: string | null = null;
    if (tokens.refresh_token) {
      refreshTokenCiphertext = encryptRefreshToken(tokens.refresh_token);
    } else {
      const { data: savedToken, error: savedTokenError } = await admin
        .schema("private")
        .from("youtube_oauth_tokens")
        .select("refresh_token_ciphertext")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (savedTokenError) {
        throw new Error(
          `Could not read the existing YouTube token (${savedTokenError.message}).`,
        );
      }
      refreshTokenCiphertext = savedToken?.refresh_token_ciphertext ?? null;
    }
    if (!refreshTokenCiphertext) {
      throw new Error(
        "Google did not return a refresh token. Revoke this app's access in your Google account and connect again.",
      );
    }

    const grantedScopes = tokens.scope
      ? tokens.scope.split(" ")
      : YOUTUBE_OAUTH_SCOPES;
    const { error: tokenSaveError } = await admin
      .schema("private")
      .from("youtube_oauth_tokens")
      .upsert(
        {
          owner_id: user.id,
          google_email: userInfo.email ?? null,
          refresh_token_ciphertext: refreshTokenCiphertext,
          encryption_key_version: 1,
          granted_scopes: grantedScopes,
        },
        { onConflict: "owner_id" },
      );
    if (tokenSaveError) {
      throw new Error(`Could not save YouTube credentials (${tokenSaveError.message}).`);
    }

    const channelRows = channels.map((channel) => ({
      owner_id: user.id,
      youtube_channel_id: channel.id,
      channel_name: channel.snippet.title,
      description: channel.snippet.description ?? "",
      custom_url: channel.snippet.customUrl ?? null,
      thumbnail_url: getThumbnailUrl(channel.snippet.thumbnails),
      country_code:
        channel.snippet.country?.length === 2 ? channel.snippet.country : null,
      published_at: channel.snippet.publishedAt ?? null,
      subscriber_count: parseCount(channel.statistics?.subscriberCount),
      hidden_subscriber_count:
        channel.statistics?.hiddenSubscriberCount ?? false,
      view_count: parseCount(channel.statistics?.viewCount),
      video_count: parseCount(channel.statistics?.videoCount),
      synced_at: new Date().toISOString(),
    }));

    const { error: channelSaveError } = await admin
      .from("youtube_channels")
      .upsert(channelRows, { onConflict: "owner_id,youtube_channel_id" });
    if (channelSaveError) {
      throw new Error(`Could not save YouTube channel information (${channelSaveError.message}).`);
    }

    return NextResponse.redirect(new URL("/?youtube=connected", request.url));
  } catch (error) {
    console.error("YouTube OAuth callback failed.", error);
    if (
      error instanceof Error &&
      error.message.includes("Invalid schema: private")
    ) {
      return failure(
        "Supabase does not expose the private schema through its API. Add private to the project's exposed schemas, then retry.",
        503,
      );
    }
    return failure("Could not connect your YouTube account.", 500);
  }
}
