"use client";

import { useState, useRef, FormEvent } from "react";
import { Sparkles } from "lucide-react";

type ThumbnailStudioProps = {
  onPromptGenerated?: (prompt: string) => void;
};

export function ThumbnailStudio({ onPromptGenerated }: ThumbnailStudioProps) {
  const [topic, setTopic] = useState("");
  const [prompt, setPrompt] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedTopic = topic.trim();

    if (!trimmedTopic) {
      setError("Please enter a story title or topic.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/generate-thumbnail", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ topic: trimmedTopic }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error ?? "Failed to generate prompt");
      }

      const result = await response.json();
      setPrompt(result.prompt);

      if (onPromptGenerated) {
        onPromptGenerated(result.prompt);
      }
    } catch (err: any) {
      setError(err.message ?? "Failed to generate prompt. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section
      className="p-6 bg-surface rounded-2xl border border-white/[0.08] shadow-sm"
    >
      <h2 className="text-xl font-semibold text-slate-100 mb-4">
        Thumbnail Studio
      </h2>

      {error && (
        <p className="mb-4 text-sm text-rose-300">{error}</p>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-4"
        ref={submitRef}
      >
        <div>
          <label className="sr-only">Story Idea or Topic</label>
          <input
            placeholder="e.g., A young boy and a blue robotic cat flying in a time machine"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={isGenerating}
            maxLength={200}
            className="w-full px-4 py-2 bg-emerald-500/10 border border-emerald-300/20 rounded-xl text-slate-100 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-300/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Story Idea or Topic"
          />
        </div>

        <button
          type="submit"
          disabled={isGenerating || !topic.trim()}
          className="w-full py-3 px-4 bg-violet-600 text-white font-medium rounded-xl hover:bg-violet-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <Sparkles className="mr-2 h-4 w-4 animate-spin" />
              <span>Generating Prompt...</span>
            </>
          ) : (
            "Generate Prompt"
          )}
        </button>
      </form>

      {prompt && !isGenerating && (
        <div className="mt-6 p-4 bg-violet-500/10 border border-violet-500/20 rounded-xl">
          <h3 className="font-medium text-slate-100 mb-2">Generated Prompt:</h3>
          <p className="font-mono text-sm text-violet-200 break-all whitespace-pre-wrap">{prompt}</p>
          <button
            className="mt-3 float-right px-3 py-1 bg-violet-600 text-sm text-white rounded hover:bg-violet-500 transition-colors"
            onClick={() => {
              // Copy to clipboard or other action
            }}
          >
            <Sparkles size={16} className="text-violet-200 mr-1" />
            Copy
          </button>
        </div>
      )}
    </section>
  );
}