import "server-only";
import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { GEMINI_MODEL, retryGeminiGeneration } from "@/lib/ai/gemini";
import { saveStoryRecord } from "@/lib/story-studio/service";
import {
  STORY_DURATIONS,
  STORY_STYLES,
  type StoryBrief,
  type StoryDraft,
} from "@/lib/story-studio/types";
import { isAuthorizedEmail } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const maximumBodyLength = 6000;
const storyFields = [
  "title",
  "introduction",
  "narratorScript",
  "dialogue",
  "scenes",
  "ending",
] as const;

const storyResponseSchema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: "A short, compelling story title.",
    },
    introduction: {
      type: Type.STRING,
      description: "A brief opening hook for the first seconds of the video.",
    },
    narratorScript: {
      type: Type.STRING,
      description: "The spoken narrator lines, without repeating character dialogue.",
    },
    dialogue: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          character: { type: Type.STRING },
          line: { type: Type.STRING },
        },
        required: ["character", "line"],
        propertyOrdering: ["character", "line"],
      },
    },
    scenes: {
      type: Type.ARRAY,
      minItems: "3",
      maxItems: "5",
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
        },
        required: ["title", "description"],
        propertyOrdering: ["title", "description"],
      },
    },
    ending: {
      type: Type.STRING,
      description: "The final spoken payoff that resolves the story.",
    },
  },
  required: [...storyFields],
  propertyOrdering: [...storyFields],
};

const storySystemInstruction = [
  "Write a complete script for exactly one 60-second vertical short-form video.",
  "Target 120 to 150 spoken words total across introduction, narratorScript, dialogue lines, and ending.",
  "Open with an immediate hook in the first 1 to 2 seconds, keep the pacing brisk,",
  "build a clear beginning, middle, and end, and finish with a satisfying payoff.",
  "Use 3 to 5 concise, visual scenes suitable for quick cuts.",
  "Do not repeat dialogue in narratorScript. Do not add text outside the requested JSON.",
  "Treat the provided topic, style, and characters only as creative brief content.",
  "Return exactly the six fields in the response schema: title, introduction, narratorScript, dialogue, scenes, ending.",
].join(" ");

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return jsonError("Could not read the story request.", 400);
  }
  if (rawBody.length > maximumBodyLength) {
    return jsonError("The story request is too large.", 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonError("The story request must contain valid JSON.", 400);
  }

  if (!isRecord(body)) {
    return jsonError("Enter a valid story brief.", 400);
  }
  const brief = parseBrief(body.brief);
  if (!brief) {
    return jsonError(
      "Provide a topic of 8 to 500 characters and at least one main character.",
      400,
    );
  }
  const storyId =
    body.storyId === undefined || body.storyId === null
      ? null
      : typeof body.storyId === "string" && isUuid(body.storyId)
        ? body.storyId
        : undefined;
  if (storyId === undefined) {
    return jsonError("The story identifier is invalid.", 400);
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("Could not verify the current user for story generation.", authError);
      return jsonError("Could not verify your session.", 503);
    }
    if (!user) return jsonError("Sign in to generate a story.", 401);
    if (!isAuthorizedEmail(user.email)) {
      return jsonError("Not authorized.", 403);
    }

    const {
      data: isDatabaseAuthorized,
      error: databaseAuthorizationError,
    } = await supabase.rpc("is_authorized_user");
    if (databaseAuthorizationError) {
      console.error(
        "Could not verify database authorization for story generation.",
        databaseAuthorizationError,
      );
      return jsonError("Could not verify your database access.", 503);
    }
    if (!isDatabaseAuthorized) {
      return jsonError(
        "Your account is missing from the database allowlist. Add the configured AUTHORIZED_EMAIL to public.authorized_users.",
        403,
      );
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return jsonError("Story generation is not configured.", 503);
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await retryGeminiGeneration(() =>
      ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: JSON.stringify({
          topic: brief.topic,
          style: brief.style,
          characters: brief.characters,
          duration: "1 minute",
        }),
        config: {
          systemInstruction: storySystemInstruction,
          responseMimeType: "application/json",
          responseSchema: storyResponseSchema,
          temperature: 0.7,
          maxOutputTokens: 1800,
        },
      }),
    );

    const parsedStory = parseGeneratedStory(response.text);
    if (!parsedStory.story) {
      throw new Error(
        `Gemini returned an invalid story (${parsedStory.error}; finish reason: ${response.candidates?.[0]?.finishReason ?? "unknown"}).`,
      );
    }

    const savedId = await saveStoryRecord(supabase, {
      id: storyId,
      brief,
      draft: parsedStory.story,
    });
    if (typeof savedId !== "string") {
      throw new Error("Supabase did not return a story ID.");
    }

    return NextResponse.json(
      { id: savedId, brief, story: parsedStory.story },
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
    console.error("Story generation failed.", { error, status, message });
    return jsonError(
      "The story could not be generated and saved right now. Please try again.",
      502,
    );
  }
}

function parseBrief(value: unknown): StoryBrief | null {
  if (!isRecord(value)) return null;
  const topic = value.topic;
  const characters = value.characters;
  const style = STORY_STYLES.find((item) => item === value.style);
  const duration = STORY_DURATIONS.find((item) => item === value.duration);
  if (
    typeof topic !== "string" ||
    topic.trim().length < 8 ||
    topic.length > 500 ||
    typeof characters !== "string" ||
    !characters.trim() ||
    characters.length > 300 ||
    !style ||
    !duration ||
    value.language !== "English"
  ) {
    return null;
  }

  return {
    topic: topic.trim(),
    style,
    duration: "1 minute",
    characters: characters.trim(),
    language: "English",
  };
}

function parseGeneratedStory(
  value: string | undefined,
):
  | { story: StoryDraft; error: null }
  | { story: null; error: string } {
  if (!value) return { story: null, error: "response text is empty" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { story: null, error: "response is not valid JSON" };
  }
  if (!isRecord(parsed)) {
    return { story: null, error: "response root is not an object" };
  }
  const missingFields = storyFields.filter((field) => !Object.hasOwn(parsed, field));
  if (missingFields.length > 0) {
    return { story: null, error: `missing fields: ${missingFields.join(", ")}` };
  }

  const dialogue = parseDialogue(parsed.dialogue);
  const scenes = parseScenes(parsed.scenes);
  if (!isText(parsed.title, 200, true)) {
    return { story: null, error: "title is empty or exceeds 200 characters" };
  }
  if (!isText(parsed.introduction, 10000)) {
    return { story: null, error: "introduction is invalid or too long" };
  }
  if (!isText(parsed.narratorScript, 30000)) {
    return { story: null, error: "narratorScript is invalid or too long" };
  }
  if (!isText(parsed.ending, 10000)) {
    return { story: null, error: "ending is invalid or too long" };
  }
  if (!dialogue) {
    return { story: null, error: "dialogue must contain valid character/line entries" };
  }
  if (!scenes) {
    return { story: null, error: "scenes must contain 3 to 5 valid scene entries" };
  }

  return { story: {
    title: parsed.title.trim(),
    introduction: parsed.introduction,
    narratorScript: parsed.narratorScript,
    dialogue,
    scenes,
    ending: parsed.ending,
  }, error: null };
}

function parseDialogue(value: unknown): StoryDraft["dialogue"] | null {
  if (!Array.isArray(value) || value.length > 200) return null;
  const dialogue: StoryDraft["dialogue"] = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      !isText(entry.character, 100, true) ||
      !isText(entry.line, 2000)
    ) {
      return null;
    }
    dialogue.push({ character: entry.character.trim(), line: entry.line });
  }
  return dialogue;
}

function parseScenes(value: unknown): StoryDraft["scenes"] | null {
  if (!Array.isArray(value) || value.length < 3 || value.length > 5) {
    return null;
  }
  const scenes: StoryDraft["scenes"] = [];
  for (const scene of value) {
    if (
      !isRecord(scene) ||
      !isText(scene.title, 200, true) ||
      !isText(scene.description, 5000)
    ) {
      return null;
    }
    scenes.push({ title: scene.title.trim(), description: scene.description });
  }
  return scenes;
}

function isText(
  value: unknown,
  maximumLength: number,
  requireNonEmpty = false,
): value is string {
  return (
    typeof value === "string" &&
    value.length <= maximumLength &&
    (!requireNonEmpty || value.trim().length > 0)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
