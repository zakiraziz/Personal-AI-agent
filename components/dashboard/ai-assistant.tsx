"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, Send, Sparkles } from "lucide-react";
import type { ChatTurn } from "@/lib/ai/chat";

const suggestedPrompts = [
  "How is my channel performing?",
  "Which recent video is doing best?",
  "Suggest an idea for my next video.",
];

type ChatResponse = {
  reply?: string;
  error?: string;
};

export function AIAssistant() {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();
    if (!message || pending) return;

    const history = messages.slice(-8);
    setPending(true);
    setPendingMessage(message);
    setError(null);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message, history }),
      });
      const result = (await response.json()) as ChatResponse;
      const reply = result.reply;
      if (!response.ok || !reply) {
        throw new Error(result.error ?? "The AI Assistant could not respond.");
      }

      setMessages((current) => [
        ...current,
        { role: "user", content: message },
        { role: "model", content: reply },
      ]);
      setInput("");
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "The AI Assistant could not respond. Please try again.",
      );
    } finally {
      setPending(false);
      setPendingMessage(null);
    }
  }

  return (
    <section className="mx-auto flex min-h-[min(720px,calc(100vh-150px))] max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-surface shadow-2xl shadow-black/10">
      <header className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-4 sm:px-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-400/[0.12] text-violet-200">
          <Bot size={20} />
        </span>
        <div>
          <h1 className="text-sm font-semibold text-slate-100">AI Assistant</h1>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Get ideas and insights for your YouTube channel
          </p>
        </div>
        <span className="ml-auto flex items-center gap-1.5 rounded-full border border-emerald-300/10 bg-emerald-300/[0.06] px-2.5 py-1 text-[9px] font-medium text-emerald-200">
          <Sparkles size={11} />
          Creator assistant
        </span>
      </header>

      <div
        aria-live="polite"
        aria-label="Conversation"
        className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6"
      >
        {messages.length === 0 ? (
          <div className="flex min-h-[340px] flex-col items-center justify-center text-center">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-300/[0.12] bg-violet-400/[0.08] text-violet-200">
              <Sparkles size={22} />
            </span>
            <h2 className="text-base font-semibold text-white">
              What would you like to create?
            </h2>
            <p className="mt-2 max-w-sm text-xs leading-5 text-slate-400">
              Ask about your channel performance, your recent videos, or what
              to make next.
            </p>
            <div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setInput(prompt)}
                  className="rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[10px] text-slate-300 transition hover:border-violet-300/20 hover:bg-violet-300/[0.06] hover:text-violet-100"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${index}-${message.role}`}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-xs leading-6 sm:max-w-[78%] ${
                  message.role === "user"
                    ? "rounded-br-md bg-violet-500/20 text-violet-50"
                    : "rounded-bl-md border border-white/[0.07] bg-white/[0.035] text-slate-200"
                }`}
              >
                {message.content}
              </div>
            </div>
          ))
        )}
        {pending && (
          <>
            <div className="flex justify-end">
              <div className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-violet-500/20 px-4 py-3 text-xs leading-6 text-violet-50 sm:max-w-[78%]">
                {pendingMessage}
              </div>
            </div>
            <div role="status" className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md border border-white/[0.07] bg-white/[0.035] px-4 py-3 text-xs text-slate-400">
                <span className="inline-flex items-center gap-2">
                  <span className="flex gap-1" aria-hidden="true">
                    <span className="h-1 w-1 animate-pulse rounded-full bg-violet-300" />
                    <span className="h-1 w-1 animate-pulse rounded-full bg-violet-300 [animation-delay:150ms]" />
                    <span className="h-1 w-1 animate-pulse rounded-full bg-violet-300 [animation-delay:300ms]" />
                  </span>
                  Thinking...
                </span>
              </div>
            </div>
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <p role="alert" className="px-5 pb-2 text-xs text-rose-300 sm:px-6">
          {error}
        </p>
      )}
      <form
        onSubmit={sendMessage}
        className="border-t border-white/[0.07] p-4 sm:px-6 sm:py-5"
      >
        <label className="sr-only" htmlFor="assistant-message">
          Message the AI Assistant
        </label>
        <div className="flex items-end gap-2 rounded-xl border border-white/[0.09] bg-[#0b1120] p-2 focus-within:border-violet-300/30">
          <textarea
            id="assistant-message"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            maxLength={2000}
            rows={2}
            placeholder="Ask about your channel or your next video..."
            className="max-h-32 min-h-12 flex-1 resize-y bg-transparent px-2 py-2 text-xs leading-5 text-slate-100 outline-none placeholder:text-slate-600"
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            aria-label={pending ? "Assistant is thinking" : "Send message"}
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500 text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send size={15} />
          </button>
        </div>
        <p className="mt-2 text-center text-[9px] text-slate-600">
          AI responses may be inaccurate. Verify important channel insights.
        </p>
      </form>
    </section>
  );
}
