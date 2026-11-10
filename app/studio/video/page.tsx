"use client";

import { useState } from "react";

export default function VideoStudioPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [privacy, setPrivacy] = useState("private");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title) {
      setMessage("Please select a video file and enter a title.");
      return;
    }
    setLoading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("videoFile", file);
    formData.append("title", title);
    formData.append("description", description);
    formData.append("tags", tags);
    formData.append("privacyStatus", privacy);

    try {
      const res = await fetch("/api/youtube/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`Video uploaded! Watch at: ${data.url}`);
        // reset form
        setTitle("");
        setDescription("");
        setTags("");
        setPrivacy("private");
        setFile(null);
      } else {
        setMessage(data.error || "Upload failed.");
      }
    } catch (err) {
      setMessage("Network error.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Video Studio</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block mb-1 text-sm font-medium">Video File</label>
          <input
            type="file"
            accept="video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full rounded border px-3 py-2"
          />
          {file && (
            <p className="mt-1 text-sm text-gray-600">
              Selected: {file.name}
            </p>
          )}
        </div>

        <div>
          <label className="block mb-1 text-sm font-medium">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="block w-full rounded border px-3 py-2"
            placeholder="e.g. My first YouTube short"
          />
        </div>

        <div>
          <label className="block mb-1 text-sm font-medium">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="block w-full rounded border px-3 py-2"
            placeholder="Describe your video..."
          ></textarea>
        </div>

        <div>
          <label className="block mb-1 text-sm font-medium">Tags (comma separated, optional)</label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="block w-full rounded border px-3 py-2"
            placeholder="tag1, tag2, tag3"
          />
        </div>

        <div>
          <label className="block mb-1 text-sm font-medium">Privacy</label>
          <div className="flex space-x-2">
            <label
              className={`flex-1 rounded border px-3 py-2 ${
                privacy === "private" ? "bg-violet-100 text-violet-800" : "text-violet-800"
              }`}
              onClick={() => setPrivacy("private")}
            >
              Private
            </label>
            <label
              className={`flex-1 rounded border px-3 py-2 ${
                privacy === "unlisted" ? "bg-violet-100 text-violet-800" : "text-violet-800"
              }`}
              onClick={() => setPrivacy("unlisted")}
            >
              Unlisted
            </label>
            <label
              className={`flex-1 rounded border px-3 py-2 ${
                privacy === "public" ? "bg-violet-100 text-violet-800" : "text-violet-800"
              }`}
              onClick={() => setPrivacy("public")}
            >
              Public
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-4 rounded bg-violet-600 text-white font-medium hover:bg-violet-700 transition disabled:opacity-50"
        >
          {loading ? "Uploading..." : "Upload to YouTube"}
        </button>
      </form>

      {message && (
        <p className="mt-4 text-center {message.startsWith("Video uploaded") ? "text-green-600" : "text-red-600"}">
          {message}
        </p>
      )}
    </div>
  );
}