"use client";

import { useState } from "react";

export function VideoStudio() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [privacy, setPrivacy] = useState("private");
  const [isUploading, setIsUploading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoPilotResult, setAutoPilotResult] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a video file.");
      return;
    }

    setIsUploading(true);
    setSuccess(null);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title);
    formData.append("description", description);
    formData.append("tags", tags);
    formData.append("privacy", privacy);

    try {
      const response = await fetch("/api/youtube/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed.");
      }

      setSuccess("Uploaded successfully! Video ID: " + data.videoId);
      setFile(null);
      setTitle("");
      setDescription("");
      setTags("");
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setIsUploading(false);
    }
  };

  const runAutoPilot = async () => {
    setError(null);
    setAutoPilotResult(null);

    try {
      const response = await fetch("/api/auto-pilot/daily?token=daily_autopilot_secret_2024", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Auto-pilot failed.");
      }

      setAutoPilotResult(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setError(err.message || "Auto-pilot failed.");
    }
  };

  return (
    <div className="p-6 bg-surface rounded-2xl border border-white/8 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-100 mb-4">Video Studio</h2>
      <p className="text-sm text-slate-400 mb-6">Upload a video directly to your YouTube channel.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Video File</label>
          <input
            type="file"
            accept="video/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            disabled={isUploading}
            className="w-full px-4 py-2 bg-emerald-500/10 border border-emerald-300/20 rounded-xl text-slate-100 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isUploading}
            placeholder="My awesome video"
            className="w-full px-4 py-2 bg-emerald-500/10 border border-emerald-300/20 rounded-xl text-slate-100 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isUploading}
            rows={3}
            placeholder="Describe your video..."
            className="w-full px-4 py-2 bg-emerald-500/10 border border-emerald-300/20 rounded-xl text-slate-100 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Tags (comma separated)</label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            disabled={isUploading}
            placeholder="cartoon, story, kids"
            className="w-full px-4 py-2 bg-emerald-500/10 border border-emerald-300/20 rounded-xl text-slate-100 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Privacy</label>
          <select
            value={privacy}
            onChange={(e) => setPrivacy(e.target.value)}
            disabled={isUploading}
            className="w-full px-4 py-2 bg-emerald-500/10 border border-emerald-300/20 rounded-xl text-slate-100 text-sm"
          >
            <option value="private">Private</option>
            <option value="unlisted">Unlisted</option>
            <option value="public">Public</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={isUploading || !file}
          className="w-full py-3 px-4 bg-violet-600 text-white font-medium rounded-xl hover:bg-violet-500 transition-colors disabled:opacity-50"
        >
          {isUploading ? "Uploading..." : "Upload to YouTube"}
        </button>
      </form>

      {success && (
        <div className="mt-4 p-3 bg-green-100 text-green-800 rounded">
          {success}
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-100 text-red-800 rounded">
          {error}
        </div>
      )}
    </div>
  );
}