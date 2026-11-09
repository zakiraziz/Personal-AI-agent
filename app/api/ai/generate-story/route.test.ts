import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  generateContent: vi.fn(),
  saveStoryRecord: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: mocks.generateContent };

    constructor(_options: { apiKey: string }) {}
  },
  Type: {
    ARRAY: "ARRAY",
    OBJECT: "OBJECT",
    STRING: "STRING",
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/story-studio/service", () => ({
  saveStoryRecord: mocks.saveStoryRecord,
}));
vi.mock("@/lib/ai/gemini", async () => import("../../../../lib/ai/gemini"));
vi.mock("@/lib/story-studio/types", async () =>
  import("../../../../lib/story-studio/types"),
);
vi.mock("@/lib/supabase/config", () => ({
  isAuthorizedEmail: (email: string | undefined) =>
    email?.toLowerCase() === process.env.AUTHORIZED_EMAIL?.toLowerCase(),
}));

import { POST } from "./route";

const originalApiKey = process.env.GEMINI_API_KEY;
const originalAuthorizedEmail = process.env.AUTHORIZED_EMAIL;

const story = {
  title: "The Pencil That Drew Tomorrow",
  introduction: "Mira's pencil sketched a door that was not there.",
  narratorScript: "At midnight, the drawing began to glow. Mira opened the door and found a tiny city waiting in the dark. Its clock had stopped, and the people were frozen mid-step. She followed a trail of golden graphite to the clock tower. A shadow guarded the hands, refusing to let morning arrive.",
  dialogue: [
    { character: "Mira", line: "What happens if I turn the clock?" },
    { character: "Pencil", line: "Draw the ending you want." },
  ],
  scenes: [
    { title: "The glowing sketch", description: "A drawn door lights up on Mira's bedroom wall." },
    { title: "The frozen city", description: "Mira steps into a miniature city where everyone has stopped moving." },
    { title: "The clock tower", description: "She reaches the tower and finds a shadow holding back time." },
  ],
  ending: "Mira draws a sunrise across the sky. The shadow becomes a sleepy cat, and the city wakes as the pencil leaves one final sparkle.",
};

const brief = {
  topic: "Write a story about a magic pencil",
  style: "Fantasy",
  duration: "5 minutes",
  characters: "Mira and a magic pencil",
  language: "English",
};

function setupUser(user: { id: string; email: string } | null) {
  const supabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
  };
  mocks.createClient.mockResolvedValue(supabase);
  return supabase;
}

function request(body: unknown) {
  return new Request("http://localhost/api/ai/generate-story", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-api-key";
  process.env.AUTHORIZED_EMAIL = "creator@example.com";
  mocks.createClient.mockReset();
  mocks.generateContent
    .mockReset()
    .mockResolvedValue({ text: JSON.stringify(story) });
  mocks.saveStoryRecord.mockReset().mockResolvedValue("story-id-123");
});

afterEach(() => {
  vi.useRealTimers();
  if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalApiKey;
  if (originalAuthorizedEmail === undefined) delete process.env.AUTHORIZED_EMAIL;
  else process.env.AUTHORIZED_EMAIL = originalAuthorizedEmail;
});

describe("POST /api/ai/generate-story", () => {
  it("generates a one-minute story in the existing format and saves it", async () => {
    const supabase = setupUser({
      id: "owner-123",
      email: "creator@example.com",
    });

    const response = await POST(request({ brief, storyId: null }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "story-id-123",
      brief: { ...brief, duration: "1 minute" },
      story,
    });
    const generation = mocks.generateContent.mock.calls[0][0];
    expect(generation.model).toBe("gemini-3.8-flash");
    expect(generation.config.systemInstruction).toContain("one 60-second");
    expect(generation.config.systemInstruction).toContain("120 to 150 spoken words");
    expect(generation.config.responseMimeType).toBe("application/json");
    expect(generation.config.responseSchema.properties.scenes).toMatchObject({
      minItems: "3",
      maxItems: "5",
    });
    expect(generation.config.responseSchema.required).toEqual([
      "title",
      "introduction",
      "narratorScript",
      "dialogue",
      "scenes",
      "ending",
    ]);
    expect(JSON.parse(generation.contents)).toEqual({
      topic: brief.topic,
      style: brief.style,
      characters: brief.characters,
      duration: "1 minute",
    });
    expect(mocks.saveStoryRecord).toHaveBeenCalledWith(supabase, {
      id: null,
      brief: { ...brief, duration: "1 minute" },
      draft: story,
    });
  });

  it("retries temporary Gemini overload before saving", async () => {
    setupUser({ id: "owner-123", email: "creator@example.com" });
    vi.useFakeTimers();
    mocks.generateContent
      .mockRejectedValueOnce({ status: 503, message: "Unavailable" })
      .mockResolvedValueOnce({ text: JSON.stringify(story) });

    const responsePromise = POST(request({ brief }));
    await vi.runAllTimersAsync();
    const response = await responsePromise;

    expect(response.status).toBe(200);
    expect(mocks.generateContent).toHaveBeenCalledTimes(2);
    expect(mocks.saveStoryRecord).toHaveBeenCalledOnce();
  });

  it("rejects unauthenticated users before calling Gemini", async () => {
    setupUser(null);

    const response = await POST(request({ brief }));

    expect(response.status).toBe(401);
    expect(mocks.generateContent).not.toHaveBeenCalled();
    expect(mocks.saveStoryRecord).not.toHaveBeenCalled();
  });

  it("rejects users missing from the database allowlist before calling Gemini", async () => {
    const supabase = setupUser({
      id: "owner-123",
      email: "creator@example.com",
    });
    supabase.rpc.mockResolvedValue({ data: false, error: null });

    const response = await POST(request({ brief }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error:
        "Your account is missing from the database allowlist. Add the configured AUTHORIZED_EMAIL to public.authorized_users.",
    });
    expect(mocks.generateContent).not.toHaveBeenCalled();
    expect(mocks.saveStoryRecord).not.toHaveBeenCalled();
  });

  it("rejects invalid briefs without calling Gemini", async () => {
    setupUser({ id: "owner-123", email: "creator@example.com" });

    const response = await POST(
      request({ brief: { ...brief, topic: "short" } }),
    );

    expect(response.status).toBe(400);
    expect(mocks.generateContent).not.toHaveBeenCalled();
    expect(mocks.saveStoryRecord).not.toHaveBeenCalled();
  });

  it("projects extra model fields into the exact persisted story format", async () => {
    setupUser({ id: "owner-123", email: "creator@example.com" });
    mocks.generateContent.mockResolvedValue({
      text: JSON.stringify({ ...story, extra: "unexpected" }),
    });

    const response = await POST(request({ brief }));

    expect(response.status).toBe(200);
    const saved = mocks.saveStoryRecord.mock.calls[0][1].draft;
    expect(Object.keys(saved)).toEqual([
      "title",
      "introduction",
      "narratorScript",
      "dialogue",
      "scenes",
      "ending",
    ]);
  });

  it("logs a specific validation reason and does not save malformed stories", async () => {
    setupUser({ id: "owner-123", email: "creator@example.com" });
    const { scenes: _scenes, ...missingScenes } = story;
    mocks.generateContent.mockResolvedValue({
      text: JSON.stringify(missingScenes),
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(request({ brief }));

    expect(response.status).toBe(502);
    expect(mocks.saveStoryRecord).not.toHaveBeenCalled();
    expect(errorSpy.mock.calls[0][1].message).toContain("missing fields: scenes");
    errorSpy.mockRestore();
  });
});
