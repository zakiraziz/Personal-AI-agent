import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptRefreshToken } from "@/lib/youtube/oauth";
import { google } from "googleapis";

export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAuthorizedEmail(user.email)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Parse FormData
    const formData = await request.formData();
    const videoFile = formData.get("videoFile") as File | null;
    const title = formData.get("title") as string | null;
    const description = formData.get("description") as string | null;
    const tagsString = formData.get("tags") as string | null;
    const privacyStatus = formData.get("privacyStatus") as string | null || "private";

    if (!videoFile || !title) {
      return NextResponse.json(
        { error: "Missing required fields (videoFile, title)" },
        { status: 400 }
      );
    }

    // Decrypt stored refresh token
    const { data: tokenRow, error: tokenError } = await supabase
      .from("youtube_oauth_tokens")
      .select("refresh_token_ciphertext")
      .eq("owner_id", user.id)
      .single();

    if (tokenError || !tokenRow?.refresh_token_ciphertext) {
      return NextResponse.json(
        { error: "YouTube not connected. Please use /api/youtube/connect first." },
        { status: 400 }
      );
    }

    const refreshToken = decryptRefreshToken(tokenRow.refresh_token_ciphertext);

    // Build OAuth2 client with refresh token
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    // Convert uploaded file to Buffer
    const arrayBuffer = await videoFile.arrayBuffer();
    const videoBuffer = Buffer.from(arrayBuffer);

    // Prepare tags array if provided
    const tags = tagsString
      ? tagsString.split(",").map((t: string) => t.trim()).filter(Boolean)
      : [];

    // YouTube Videos.insert
    const youtube = google.youtube({
      version: "v3",
      auth: oauth2Client,
    });

    const response = await youtube.videos.insert({
      part: "snippet,status",
      requestBody: {
        snippet: {
          title,
          description: description || "",
          tags,
        },
        status: {
          privacyStatus: privacyStatus as "public" | "unlisted" | "private",
        },
      },
      media: {
        body: videoBuffer,
      },
    });

    const videoId = response.data.id;
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

    return NextResponse.json({
      success: true,
      videoId,
      url: watchUrl,
    });
  } catch (error: any) {
    console.error("YouTube upload failed.", error);
    const message =
      error?.response?.data?.error?.message || error?.message || "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}