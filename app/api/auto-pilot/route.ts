import "server-only";
import { NextResponse } from "next/server";

// Step 1: Generate Story using existing Gemini logic
async function generateStory(prompt: string) {
  const res = await fetch("/api/ai/generate-story", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(`Story generation failed: ${errorData.error || "Unknown error"}`);
  }

  const data = await res.json();
  // The story route returns a story object, extract the text/narrative
  // We need to get a usable text representation
  return data.story || data.introduction || "Generated story content";
}

// Step 2: Generate Voiceover using ElevenLabs
async function generateVoiceover(storyText: string) {
  const res = await fetch("/api/ai/generate-voice", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: storyText }),
  });

  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(`Voiceover generation failed: ${errorData.error || "Unknown error"}`);
  }

  const data = await res.json();
  return data.audioUrl || "";
}

// Step 3: Generate Thumbnail using DALL-E 3
async function generateThumbnail(storyText: string) {
  const res = await fetch("/api/ai/generate-thumbnail", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt: storyText }),
  });

  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(`Thumbnail generation failed: ${errorData.error || "Unknown error"}`);
  }

  const data = await res.json();
  return data.imageUrl || "";
}

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    // Step 1: Generate Story (Gemini)
    setTimeout(() => {}, 0); // Yield control
    const story = await generateStory(prompt);

    // Step 2: Generate Voiceover using the generated story text
    const audioUrl = await generateVoiceover(story);

    // Step 3: Generate Thumbnail using the story text
    const thumbnailUrl = await generateThumbnail(story);

    return NextResponse.json({
      story,
      audioUrl,
      thumbnailUrl,
    });
  } catch (error: any) {
    console.error("Auto-pilot error:", error);
    return NextResponse.json(
      { error: error.message || "Auto-pilot failed" },
      { status: 500 }
    );
  }
}