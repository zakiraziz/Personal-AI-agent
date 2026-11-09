"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

type SyncResult = {
  error?: string;
  synced?: {
    playlists: number;
    videos: number;
    analyticsDays: number;
  };
};

export function SyncNowButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function syncNow() {
    setPending(true);
    setMessage(null);
    setIsError(false);

    try {
      const response = await fetch("/api/youtube/sync", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const result = (await response.json()) as SyncResult;
      if (!response.ok || !result.synced) {
        throw new Error(result.error ?? "YouTube sync failed.");
      }

      setMessage(
        `Synced ${result.synced.videos} videos and ${result.synced.analyticsDays} analytics days.`,
      );
      router.refresh();
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error ? error.message : "YouTube sync failed.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={syncNow}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300/20 bg-violet-300/[0.08] px-3 py-2 text-[10px] font-medium text-violet-100 transition hover:bg-violet-300/[0.14] disabled:cursor-wait disabled:opacity-60"
      >
        <RefreshCw size={12} className={pending ? "animate-spin" : ""} />
        {pending ? "Syncing..." : "Sync Now"}
      </button>
      {message && (
        <p
          role={isError ? "alert" : "status"}
          className={`max-w-64 text-right text-[9px] ${isError ? "text-rose-300" : "text-emerald-300"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
