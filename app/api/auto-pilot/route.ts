import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptRefreshToken } from "@/lib/youtube/oauth";
import { OAuth2Client } from "google-auth-library";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Get the form data
    const formData = await req.formData();
    const videoFile = formData.get("videoFile") as File;
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const privacyStatus = formData.get("privacyStatus") as string || "private";

    if (!videoFile || !title) {
      return NextResponse.json({ error: "Missing video file or title" }, { status: 400 });
    }

    // 2. Get the refresh token from the database
    const { data: tokenData, error: tokenError } = await (supabase as any)
      .from("youtube_oauth_tokens")
      .select("refresh_token")
      .eq("user_id", user.id)
      .single();

    if (tokenError || !tokenData) {
      return NextResponse.json({ error: "YouTube account not connected" }, { status: 400 });
    }

    // 3. Decrypt the token and get a fresh access token
    const refreshToken = decryptRefreshToken(tokenData.refresh_token);
    
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    
    const { token: accessToken } = await oauth2Client.getAccessToken();

    if (!accessToken) {
      return NextResponse.json({ error: "Failed to refresh access token" }, { status: 401 });
    }

    // 4. Prepare the metadata for YouTube
    const metadata = {
      snippet: {
        title: title,
        description: description,
        categoryId: "22", // 22 is "People & Blogs", you can change this
      },
      status: {
        privacyStatus: privacyStatus,
        selfDeclaredMadeForKids: false,
      },
    };

    // 5. Upload the video using Google's resumable upload API
    const fileBuffer = Buffer.from(await videoFile.arrayBuffer());
    
    // First, initiate the upload
    const initRes = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Length": fileBuffer.length.toString(),
        "X-Upload-Content-Type": videoFile.type || "video/mp4",
      },
      body: JSON.stringify(metadata),
    });

    if (!initRes.ok) {
      const errorData = await initRes.text();
      console.error("YouTube API init error:", errorData);
      return NextResponse.json({ error: "Failed to initiate upload" }, { status: 500 });
    }

    // Get the upload URL from the 'Location' header
    const uploadUrl = initRes.headers.get("Location");
    if (!uploadUrl) {
      return NextResponse.json({ error: "Missing upload URL" }, { status: 500 });
    }

    // Second, upload the actual file
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": videoFile.type || "video/mp4",
        "Content-Length": fileBuffer.length.toString(),
      },
      body: fileBuffer,
    });

    if (!uploadRes.ok) {
      const errorData = await uploadRes.text();
      console.error("YouTube API upload error:", errorData);
      return NextResponse.json({ error: "Failed to upload video" }, { status: 500 });
    }

    const result = await uploadRes.json();
    
    return NextResponse.json({ 
      success: true, 
      videoId: result.id,
      url: `https://youtu.be/${result.id}`
    });

  } catch (error: any) {
    console.error("Upload route error:", error);
    return NextResponse.json({ error: error.message || "Failed to upload video" }, { status: 500 });
  }
}
