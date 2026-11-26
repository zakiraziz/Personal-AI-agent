import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { imagePrompt } = await request.json();

    if (!imagePrompt) {
      return new Response(JSON.stringify({ error: "Prompt is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Construct Pollinations.ai video URL
    // The endpoint creates an animated video from the prompt
    const encodedPrompt = encodeURIComponent(imagePrompt);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux&nologo=true`;

    return new Response(JSON.stringify({ videoUrl: pollinationsUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Pollinations error:", error);
    return new Response(JSON.stringify({ error: "Failed to generate video" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}