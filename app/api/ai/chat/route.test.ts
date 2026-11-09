import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  generateContent: vi.fn(),
  parseChatRequest: vi.fn(),
  buildChannelContext: vi.fn(),
  getAssistantSystemInstruction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: mocks.generateContent };

    constructor(_options: { apiKey: string }) {}
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/supabase/config", () => ({
  isAuthorizedEmail: (email: string | undefined) =>
    email?.toLowerCase() === process.env.AUTHORIZED_EMAIL?.toLowerCase(),
}));
vi.mock("@/lib/ai/chat", () => ({
  buildChannelContext: mocks.buildChannelContext,
  getAssistantSystemInstruction: mocks.getAssistantSystemInstruction,
  parseChatRequest: mocks.parseChatRequest,
}));
vi.mock("@/lib/ai/gemini", async () => import("../../../../lib/ai/gemini"));
vi.mock("@/lib/youtube/sync-data", () => ({
  getAnalyticsDateRange: () => ({ startDate: "2026-10-13" }),
}));

import { POST } from "./route";

const originalApiKey = process.env.GEMINI_API_KEY;
const originalAuthorizedEmail = process.env.AUTHORIZED_EMAIL;
const queryBuilders = new Map<string, ReturnType<typeof createQueryBuilder>>();

function createQueryBuilder(table: string) {
  const result = {
    youtube_channels: {
      data: {
        id: "channel-row-id",
        channel_name: "My Channel",
        subscriber_count: 21,
        hidden_subscriber_count: false,
        view_count: 950,
        video_count: 12,
      },
      error: null,
    },
    youtube_videos: {
      data: [
        {
          title: "My recent video",
          published_at: "2026-11-10T00:00:00.000Z",
          view_count: 50,
          like_count: 4,
          comment_count: 1,
          privacy_status: "public",
        },
      ],
      error: null,
    },
    youtube_analytics_daily: {
      data: [
        {
          report_date: "2026-11-10",
          views: 12,
          watch_time_minutes: 30,
        },
      ],
      error: null,
    },
  }[table as "youtube_channels" | "youtube_videos" | "youtube_analytics_daily"];
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    order: vi.fn(() =>
      table === "youtube_analytics_daily" ? Promise.resolve(result) : builder,
    ),
    limit: vi.fn(() =>
      table === "youtube_channels" ? builder : Promise.resolve(result),
    ),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

function setupUser(user: { id: string; email: string } | null) {
  mocks.createClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
  });
  mocks.createAdminClient.mockReturnValue({
    from: vi.fn((table: string) => {
      const builder = createQueryBuilder(table);
      queryBuilders.set(table, builder);
      return builder;
    }),
  });
}

function request(body: unknown) {
  return new Request("http://localhost/api/ai/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-api-key";
  process.env.AUTHORIZED_EMAIL = "creator@example.com";
  mocks.createClient.mockReset();
  mocks.createAdminClient.mockReset();
  queryBuilders.clear();
  mocks.generateContent.mockReset().mockResolvedValue({ text: "Try a short tutorial." });
  mocks.parseChatRequest.mockImplementation((body: unknown) => {
    if (
      !body ||
      typeof body !== "object" ||
      !("message" in body) ||
      typeof body.message !== "string" ||
      !body.message.trim()
    ) {
      return null;
    }
    return {
      message: body.message.trim(),
      history:
        "history" in body && Array.isArray(body.history) ? body.history : [],
    };
  });
  mocks.buildChannelContext.mockImplementation(
    (channel: { channel_name: string }) =>
      JSON.stringify({ channel: channel.channel_name, video: "My recent video" }),
  );
  mocks.getAssistantSystemInstruction.mockImplementation(
    (context: string) => `Channel context: ${context}`,
  );
});

afterEach(() => {
  vi.useRealTimers();
  if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalApiKey;
  if (originalAuthorizedEmail === undefined) delete process.env.AUTHORIZED_EMAIL;
  else process.env.AUTHORIZED_EMAIL = originalAuthorizedEmail;
});

describe("POST /api/ai/chat", () => {
  it("rejects unauthenticated users before loading channel data", async () => {
    setupUser(null);

    const response = await POST(request({ message: "Give me video ideas." }));

    expect(response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it("loads only the owner's data and returns a Gemini response", async () => {
    setupUser({ id: "owner-123", email: "creator@example.com" });

    const response = await POST(
      request({
        message: "What should I make next?",
        history: [{ role: "user", content: "Hello" }],
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      reply: "Try a short tutorial.",
    });
    const generated = mocks.generateContent.mock.calls[0][0];
    expect(generated.model).toBe("gemini-3.8-flash");
    expect(generated.contents).toHaveLength(2);
    expect(generated.config.systemInstruction).toContain("My recent video");
    expect(generated.config.systemInstruction).toContain("My Channel");
    for (const table of [
      "youtube_channels",
      "youtube_videos",
      "youtube_analytics_daily",
    ]) {
      expect(queryBuilders.get(table)?.eq.mock.calls).toContainEqual([
        "owner_id",
        "owner-123",
      ]);
    }
  });

  it("retries Gemini 503 errors with exponential backoff", async () => {
    setupUser({ id: "owner-123", email: "creator@example.com" });
    vi.useFakeTimers();
    mocks.generateContent
      .mockRejectedValueOnce({ status: 503, message: "Unavailable" })
      .mockRejectedValueOnce({ status: 503, message: "Unavailable" })
      .mockResolvedValueOnce({ text: "Try a short tutorial." });

    const responsePromise = POST(request({ message: "Give me video ideas." }));
    await vi.runAllTimersAsync();
    const response = await responsePromise;

    expect(response.status).toBe(200);
    expect(mocks.generateContent).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops retrying after three Gemini 503 retries", async () => {
    setupUser({ id: "owner-123", email: "creator@example.com" });
    vi.useFakeTimers();
    mocks.generateContent.mockRejectedValue({ status: 503, message: "Unavailable" });

    const responsePromise = POST(request({ message: "Give me video ideas." }));
    await vi.runAllTimersAsync();
    const response = await responsePromise;

    expect(response.status).toBe(502);
    expect(mocks.generateContent).toHaveBeenCalledTimes(4);
  });

  it("does not retry Gemini errors other than 503", async () => {
    setupUser({ id: "owner-123", email: "creator@example.com" });
    mocks.generateContent.mockRejectedValue({
      status: 400,
      message: "Invalid request",
    });

    const response = await POST(request({ message: "Give me video ideas." }));

    expect(response.status).toBe(502);
    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid input without calling Gemini", async () => {
    setupUser({ id: "owner-123", email: "creator@example.com" });

    const response = await POST(request({ message: " " }));

    expect(response.status).toBe(400);
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it("returns a service error when the API key is missing", async () => {
    setupUser({ id: "owner-123", email: "creator@example.com" });
    delete process.env.GEMINI_API_KEY;

    const response = await POST(request({ message: "Give me video ideas." }));

    expect(response.status).toBe(503);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
