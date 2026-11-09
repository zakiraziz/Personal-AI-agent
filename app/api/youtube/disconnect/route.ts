import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedEmail } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error("Could not verify the current user for YouTube disconnect.", authError);
    return NextResponse.json(
      { error: "Could not verify your session." },
      { status: 503 },
    );
  }
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }
  if (!isAuthorizedEmail(user.email)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  try {
    const admin = createAdminClient();
    const { error: tokenError } = await admin
      .schema("private")
      .from("youtube_oauth_tokens")
      .delete()
      .eq("owner_id", user.id);
    if (tokenError) {
      throw new Error(`Could not remove YouTube credentials: ${tokenError.message}`);
    }

    const { error: channelError } = await admin
      .from("youtube_channels")
      .delete()
      .eq("owner_id", user.id);
    if (channelError) {
      throw new Error(`Could not remove YouTube channel data: ${channelError.message}`);
    }

    return NextResponse.redirect(
      new URL("/?youtube=disconnected", request.url),
      303,
    );
  } catch (error) {
    console.error("Could not disconnect YouTube.", error);
    return NextResponse.json(
      { error: "Could not disconnect your YouTube account." },
      { status: 500 },
    );
  }
}
