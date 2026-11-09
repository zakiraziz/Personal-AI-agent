import { NextResponse, type NextRequest } from "next/server";
import {
  createOAuthState,
  YOUTUBE_OAUTH_SCOPES,
} from "@/lib/youtube/oauth";
import { createClient } from "@/lib/supabase/server";
import { isAuthorizedEmail } from "@/lib/supabase/config";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      console.error("Could not verify the current user for YouTube OAuth.", error);
      return NextResponse.json(
        { error: "Could not verify your session." },
        { status: 503 },
      );
    }

    if (!user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", "/api/youtube/connect");
      return NextResponse.redirect(loginUrl);
    }

    if (!isAuthorizedEmail(user.email)) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
    if (!clientId || !redirectUri) {
      throw new Error(
        "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI.",
      );
    }

    const state = createOAuthState(user.id);
    const authorizationUrl = new URL(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    authorizationUrl.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: YOUTUBE_OAUTH_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent select_account",
      include_granted_scopes: "true",
      state,
    }).toString();

    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    console.error("Could not start YouTube OAuth.", error);
    return NextResponse.json(
      { error: "YouTube connection is not configured correctly." },
      { status: 500 },
    );
  }
}
