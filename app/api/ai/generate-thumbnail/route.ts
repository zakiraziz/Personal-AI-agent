import "server-only";
import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { GEMINI_MODEL, retryGeminiGeneration } from "@/lib/ai/gemini";
import { isAuthorizedEmail } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const maximumBodyLength = 2000;

const thumbnailSystemInstruction = [
  "You are an AI prompt engineer specialized in creating highly detailed, descriptive",
  "image prompts for cartoon-style thumbnail generation.",
  "Create a prompt that describes a complete scene with:",
  "- Main subject(s) and their appearance",
  "- Setting/background environment",
  "- Action or pose",
  "- Lighting and mood",
  "- Color palette",
  "- Art style (cartoon, vibrant, expressive)",
  "The prompt should be detailed enough to generate a high-quality thumbnail image",
  "but concise enough for the AI image generator.",
].join(" ");

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return jsonError("Could not read the thumbnail request.", 400);
  }

  if (rawBody.length > maximumBodyLength) {
    return jsonError("The thumbnail request is too large.", 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonError("The thumbnail request must contain valid JSON.", 400);
  }

  if (!isRecord(body)) {
    return jsonError("Enter a valid story title or topic.", 400);
  }

  const { topic } = body as { topic: string };

  if (!topic || typeof topic !== "string" || !topic.trim()) {
    return jsonError("A story title or topic is required.", 400);
  }

  if (topic.length > 200) {
    return jsonError("The topic must be 200 characters or less.", 400);
  }

  // Use the retry logic for Gemini API calls
  const generatePrompt = async (): Promise<string> => {
    const client = new GoogleGenAI();

    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: `${thumbnailSystemInstruction}

      Topic: "${topic.trim()}"
      
      Generate a highly detailed, descriptive image prompt for a cartoon-style thumbnail.
      Return ONLY the prompt text, no additional text or explanation.`,
    });

    if (!response || !response.text) {
      throw new Error("No response from Gemini AI");
    }

    return response.text.trim();
  };

  try {
    const prompt = await retryGeminiGeneration(generatePrompt);

    // Save the generated prompt to the database
    const supabase = await createClient();
    const { data: user, error: userError } = await supabase.auth.getUser();

    if (userError || !user.user) {
      return jsonError("Could not authenticate user.", 401);
    }

    const { error: dbError } = await supabase
      .from("thumbnail_prompts")
      .insert({
        owner_id: user.user.id,
        prompt_text: prompt,
      });

    if (dbError) {
      console.error("Error saving thumbnail prompt:", dbError);
      // Continue even if save fails - we still return the prompt
    }

    return NextResponse.json({ prompt });
  } catch (error: any) {
    console.error("Gemini generation error:", error);

    // Check if it's a 503 error or other recoverable error
    const status =
      error !== null && typeof error === "object" && "status" in error
        ? error.status
        : undefined;

    if (status === 503) {
      return NextResponse.json(
        { error: "Gemini API is temporarily overloaded. Please try again." },
        { status: 503 }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message ?? "An unexpected error occurred." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}