import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createOAuthState,
  decryptRefreshToken,
  encryptRefreshToken,
  verifyOAuthState,
} from "./oauth";
import {
  fetchPaginatedYouTubeItems,
  getAnalyticsDateRange,
  parseAnalyticsReportDate,
  parseYouTubeDuration,
  upsertInChunks,
  YouTubeApiError,
} from "./sync-data";

const originalEncryptionKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;

function setEncryptionKey(byte = 7) {
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, byte).toString(
    "base64",
  );
}

afterEach(() => {
  if (originalEncryptionKey === undefined) {
    delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  } else {
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = originalEncryptionKey;
  }
  vi.useRealTimers();
});

describe("YouTube OAuth state", () => {
  beforeEach(() => setEncryptionKey());

  it("verifies an unexpired state for its initiating user", () => {
    expect(verifyOAuthState(createOAuthState("user-123"))).toBe("user-123");
  });

  it("rejects state with a modified payload", () => {
    const state = createOAuthState("user-123");
    const [payload, signature] = state.split(".");
    const modifiedPayload = `${payload.slice(0, -1)}${payload.endsWith("A") ? "B" : "A"}`;

    expect(verifyOAuthState(`${modifiedPayload}.${signature}`)).toBeNull();
  });

  it("rejects an expired state", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const state = createOAuthState("user-123");

    vi.setSystemTime(new Date("2026-01-01T00:10:01.000Z"));
    expect(verifyOAuthState(state)).toBeNull();
  });

  it("rejects state signed with a different key", () => {
    const state = createOAuthState("user-123");
    setEncryptionKey(8);

    expect(verifyOAuthState(state)).toBeNull();
  });
});

describe("YouTube refresh-token encryption", () => {
  beforeEach(() => setEncryptionKey());

  it("decrypts a token encrypted with the configured key", () => {
    const encrypted = encryptRefreshToken("refresh-token-value");

    expect(decryptRefreshToken(encrypted)).toBe("refresh-token-value");
  });

  it("rejects malformed or unsupported token ciphertext", () => {
    expect(() => decryptRefreshToken("v2:iv:tag:ciphertext")).toThrow(
      "unsupported format",
    );
    expect(() => decryptRefreshToken("v1:iv:tag:ciphertext")).toThrow(
      "malformed",
    );
  });

  it("rejects a token encrypted with a different key", () => {
    const encrypted = encryptRefreshToken("refresh-token-value");
    setEncryptionKey(8);

    expect(() => decryptRefreshToken(encrypted)).toThrow("authenticated");
  });
});

describe("YouTube sync data helpers", () => {
  it("fetches every page in sequence", async () => {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(input.toString());
      calls.push(url.searchParams.get("pageToken") ?? "first");
      const page =
        calls.length === 1
          ? { items: [{ id: "one" }], nextPageToken: "page-two" }
          : { items: [{ id: "two" }] };
      return Response.json(page);
    };

    await expect(
      fetchPaginatedYouTubeItems<{ id: string }>(
        "https://youtube.googleapis.com/test?part=snippet",
        "access-token",
        fetcher,
      ),
    ).resolves.toEqual([{ id: "one" }, { id: "two" }]);
    expect(calls).toEqual(["first", "page-two"]);
  });

  it("supports empty lists and rejects upstream errors", async () => {
    const emptyFetcher: typeof fetch = async () => Response.json({});
    await expect(
      fetchPaginatedYouTubeItems(
        "https://youtube.googleapis.com/test",
        "access-token",
        emptyFetcher,
      ),
    ).resolves.toEqual([]);

    const failingFetcher: typeof fetch = async () =>
      new Response(null, { status: 403 });
    await expect(
      fetchPaginatedYouTubeItems(
        "https://youtube.googleapis.com/test",
        "access-token",
        failingFetcher,
      ),
    ).rejects.toBeInstanceOf(YouTubeApiError);
  });

  it("rejects a repeated pagination token", async () => {
    const repeatedTokenFetcher: typeof fetch = async () =>
      Response.json({ nextPageToken: "repeat" });

    await expect(
      fetchPaginatedYouTubeItems(
        "https://youtube.googleapis.com/test",
        "access-token",
        repeatedTokenFetcher,
      ),
    ).rejects.toThrow("repeated a pagination token");
  });

  it("stops and reports failed database upserts", async () => {
    const savedBatches: number[] = [];

    await expect(
      upsertInChunks(
        "youtube_videos",
        [{ id: "one" }, { id: "two" }],
        async (batch) => {
          savedBatches.push(batch.length);
          return { error: { message: "database unavailable" } };
        },
      ),
    ).rejects.toThrow(
      "Could not save youtube_videos (database unavailable).",
    );
    expect(savedBatches).toEqual([2]);
  });

  it.each([
    ["PT1H2M3S", 3723],
    ["PT45S", 45],
    ["PT4M", 240],
    ["PT0S", 0],
    ["bad-duration", null],
    ["P1D", null],
  ])("parses duration %s", (duration, expected) => {
    expect(parseYouTubeDuration(duration)).toBe(expected);
  });

  it.each([
    ["2026-10-23", "2026-10-23"],
    ["20261023", "2026-10-23"],
    ["2026-02-29", null],
    ["20261301", null],
    ["not-a-date", null],
  ])("parses Analytics date %s", (value, expected) => {
    expect(parseAnalyticsReportDate(value)).toBe(expected);
  });

  it("returns the previous 30 complete UTC dates", () => {
    expect(getAnalyticsDateRange(new Date("2026-11-12T16:00:00.000Z"))).toEqual({
      startDate: "2026-10-13",
      endDate: "2026-11-11",
    });
  });
});
