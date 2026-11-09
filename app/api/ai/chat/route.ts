import "server-only";
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedEmail } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import {
  buildChannelContext,
  getAssistantSystemInstruction,
  parseChatRequest,
} from "@/lib/ai/chat";
import { GEMINI_MODEL, retryGeminiGeneration } from "@/lib/ai/gemini";
import { getAnalyticsDateRange } from "@/lib/youtube/sync-data";

const maximumBodyLength = 24000;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return jsonError("Could not read the chat request.", 400);
  }
  if (rawBody.length > maximumBodyLength) {
    return jsonError("The chat request is too large.", 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonError("The chat request must contain valid JSON.", 400);
  }

  const chatRequest = parseChatRequest(body);
  if (!chatRequest) {
    return jsonError(
      "Enter a message and provide no more than eight recent chat turns.",
      400,
    );
  }

  let supabase;
  try {
    supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("Could not verify the current user for AI chat.", authError);
      return jsonError("Could not verify your session.", 503);
    }
    if (!user) return jsonError("Sign in to use the AI Assistant.", 401);
    if (!isAuthorizedEmail(user.email)) {
      return jsonError("Not authorized.", 403);
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return jsonError("The AI Assistant is not configured.", 503);
    }

    const admin = createAdminClient();
    const { data: channel, error: channelError } = await admin
      .from("youtube_channels")
      .select(
        "id, channel_name, subscriber_count, hidden_subscriber_count, view_count, video_count",
      )
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (channelError) {
      throw new Error(`Could not load the connected channel (${channelError.message}).`);
    }

    let videos: Awaited<ReturnType<typeof loadVideos>> = [];
    let analytics: Awaited<ReturnType<typeof loadAnalytics>> = [];
    if (channel) {
      [videos, analytics] = await Promise.all([
        loadVideos(admin, user.id, channel.id),
        loadAnalytics(admin, user.id, channel.id),
      ]);
    }

    const context = buildChannelContext(channel, videos, analytics);
    const ai = new GoogleGenAI({ apiKey });
    const response = await retryGeminiGeneration(() =>
      ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          ...chatRequest.history.map((turn) => ({
            role: turn.role,
            parts: [{ text: turn.content }],
          })),
          { role: "user", parts: [{ text: chatRequest.message }] },
        ],
        config: {
          systemInstruction: getAssistantSystemInstruction(context),
          temperature: 0.5,
          maxOutputTokens: 1024,
        },
      }),
    );

    const reply = response.text?.trim();
    if (!reply) {
      throw new Error("Gemini returned an empty response.");
    }

    return NextResponse.json(
      { reply },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const errorDetails =
      error !== null && typeof error === "object" ? error : undefined;
    const status =
      errorDetails && "status" in errorDetails ? errorDetails.status : undefined;
    const message =
      error instanceof Error
        ? error.message
        : errorDetails &&
            "message" in errorDetails &&
            typeof errorDetails.message === "string"
          ? errorDetails.message
          : String(error);
    console.error("AI Assistant request failed.", { error, status, message });
    return jsonError(
      "The AI Assistant could not respond right now. Please try again.",
      502,
    );
  }
}

async function loadVideos(
  admin: ReturnType<typeof createAdminClient>,
  ownerId: string,
  channelId: string,
) {
  const { data, error } = await admin
    .from("youtube_videos")
    .select(
      "title, published_at, view_count, like_count, comment_count, privacy_status",
    )
    .eq("owner_id", ownerId)
    .eq("channel_id", channelId)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(20);

  if (error) {
    throw new Error(`Could not load synced videos (${error.message}).`);
  }
  return data;
}

async function loadAnalytics(
  admin: ReturnType<typeof createAdminClient>,
  ownerId: string,
  channelId: string,
) {
  const { startDate } = getAnalyticsDateRange();
  const { data, error } = await admin
    .from("youtube_analytics_daily")
    .select("report_date, views, watch_time_minutes")
    .eq("owner_id", ownerId)
    .eq("channel_id", channelId)
    .gte("report_date", startDate)
    .order("report_date", { ascending: true });

  if (error) {
    throw new Error(`Could not load synced analytics (${error.message}).`);
  }
  return data;
}
