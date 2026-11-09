export type GooglePage<T> = {
  items?: T[];
  nextPageToken?: string;
};

export class YouTubeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "YouTubeApiError";
  }
}

export async function upsertInChunks<T>(
  table: string,
  rows: T[],
  saveChunk: (chunk: T[]) => PromiseLike<{ error: { message: string } | null }>,
) {
  for (let offset = 0; offset < rows.length; offset += 500) {
    const { error } = await saveChunk(rows.slice(offset, offset + 500));
    if (error) {
      throw new Error(`Could not save ${table} (${error.message}).`);
    }
  }
}

export async function fetchPaginatedYouTubeItems<T>(
  endpoint: string,
  accessToken: string,
  fetcher: typeof fetch = fetch,
) {
  const items: T[] = [];
  let pageToken: string | undefined;
  const seenPageTokens = new Set<string>();

  do {
    if (pageToken && seenPageTokens.has(pageToken)) {
      throw new Error("YouTube API repeated a pagination token.");
    }
    if (pageToken) seenPageTokens.add(pageToken);
    const url = new URL(endpoint);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetcher(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new YouTubeApiError(
        `YouTube API request failed (${response.status}).`,
        response.status,
      );
    }

    const page = (await response.json()) as GooglePage<T>;
    if (page.items) items.push(...page.items);
    pageToken = page.nextPageToken;
  } while (pageToken);

  return items;
}

export function parseYouTubeDuration(duration: string | undefined) {
  if (!duration) return null;
  const match =
    /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration);
  if (!match || !match.slice(1).some(Boolean)) return null;

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  return Number.isSafeInteger(totalSeconds) ? totalSeconds : null;
}

export function parseAnalyticsReportDate(value: string) {
  const formattedDate = /^\d{8}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? value
      : null;
  if (!formattedDate) return null;

  const date = new Date(`${formattedDate}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== formattedDate
    ? null
    : formattedDate;
}

export function getAnalyticsDateRange(now = new Date()) {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}
