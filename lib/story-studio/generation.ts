import type { StoryBrief, StoryDraft } from "@/lib/story-studio/types";

export type GeneratedStory = {
  id: string;
  brief: StoryBrief;
  story: StoryDraft;
};

export async function generateStory(
  brief: StoryBrief,
  storyId: string | null,
): Promise<GeneratedStory> {
  const response = await fetch("/api/ai/generate-story", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brief, storyId }),
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Story generation returned an invalid response.");
  }

  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : "The story could not be generated right now.";
    throw new Error(message);
  }
  if (!isGeneratedStory(payload)) {
    throw new Error("Story generation returned an invalid story.");
  }
  return payload;
}

function isGeneratedStory(value: unknown): value is GeneratedStory {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !isRecord(value.brief) ||
    !isRecord(value.story)
  ) {
    return false;
  }
  const brief = value.brief;
  const story = value.story;
  return (
    typeof brief.topic === "string" &&
    typeof brief.style === "string" &&
    typeof brief.duration === "string" &&
    typeof brief.characters === "string" &&
    brief.language === "English" &&
    typeof story.title === "string" &&
    typeof story.introduction === "string" &&
    typeof story.narratorScript === "string" &&
    Array.isArray(story.dialogue) &&
    story.dialogue.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.character === "string" &&
        typeof entry.line === "string",
    ) &&
    Array.isArray(story.scenes) &&
    story.scenes.every(
      (scene) =>
        isRecord(scene) &&
        typeof scene.title === "string" &&
        typeof scene.description === "string",
    ) &&
    typeof story.ending === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
