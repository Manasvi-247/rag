"use client";

import { useEffect, useRef, useState } from "react";

interface Source {
  page?: number;
  snippet: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

interface Props {
  docId: string | null;
  filename: string | null;
}

const SUGGESTED = [
  "Summarize this document in 5 bullets",
  "What are the key takeaways?",
  "Explain the main concepts to a beginner",
];

export default function Chat({ docId, filename }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const disabled = !docId || busy;

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  useEffect(() => {
    setMessages([]);
  }, [docId]);

  async function ask(question: string) {
    if (!question.trim() || !docId) return;

    setMessages((m) => [...m, { role: "user", content: question }]);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docId, question }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat failed");
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.answer, sources: data.sources },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Chat failed";
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${message}` }]);
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void ask(input.trim());
  }

  return (
    <div className="glass flex h-full flex-col overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-[#2b2140]/8 bg-white/40 px-5 py-3">
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              docId
                ? "bg-[#70d6ff] shadow-[0_0_10px] shadow-[#70d6ff]"
                : "bg-[#2b2140]/20"
            }`}
          />
          {docId ? (
            <span className="text-[#5b4f78]">
              Chatting with{" "}
              <span className="font-semibold text-[#2b2140]">{filename}</span>
            </span>
          ) : (
            <span className="text-[#5b4f78]">No document loaded</span>
          )}
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setMessages([])}
            className="text-xs font-medium text-[#5b4f78] hover:text-[#ff70a6]"
          >
            Clear
          </button>
        )}
      </div>

      <div ref={scrollerRef} className="scroll-pretty min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-6">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff70a6] via-[#ff9770] to-[#70d6ff] shadow-xl shadow-[#ff70a6]/30 ring-4 ring-white">
              <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7 text-white">
                <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="mt-4 text-base font-bold text-[#2b2140]">
              {docId ? "Ask anything about this document" : "Upload a document to begin"}
            </p>
            <p className="mt-1 max-w-sm text-xs text-[#5b4f78]">
              Answers come strictly from the uploaded content. Citations include page numbers when available.
            </p>

            {docId && (
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {SUGGESTED.map((s, i) => {
                  const colors = [
                    "hover:border-[#ff70a6]/60 hover:bg-[#ff70a6]/10",
                    "hover:border-[#ff9770]/60 hover:bg-[#ff9770]/10",
                    "hover:border-[#70d6ff]/60 hover:bg-[#70d6ff]/10",
                  ];
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void ask(s)}
                      className={`rounded-full border border-[#2b2140]/10 bg-white/70 px-3 py-1.5 text-xs font-medium text-[#2b2140] shadow-sm transition ${colors[i]}`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className="animate-fade-up space-y-2">
            {m.role === "user" ? (
              <div className="flex justify-end">
                <div className="bubble-user max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm font-medium">
                  <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#70d6ff] to-[#ff70a6] text-[10px] font-bold text-white shadow-md ring-2 ring-white">
                  AI
                </div>
                <div className="max-w-[85%] flex-1">
                  <div className="bubble-assistant rounded-2xl rounded-tl-md px-4 py-2.5 text-sm">
                    <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  </div>
                  {m.sources && m.sources.length > 0 && (
                    <details className="group mt-2 ml-1 text-xs">
                      <summary className="cursor-pointer list-none text-[#5b4f78] transition hover:text-[#ff70a6]">
                        <span className="inline-flex items-center gap-1 font-medium">
                          <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3 group-open:rotate-90">
                            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          {m.sources.length} source{m.sources.length === 1 ? "" : "s"}
                        </span>
                      </summary>
                      <ul className="mt-2 space-y-2">
                        {m.sources.map((s, j) => (
                          <li
                            key={j}
                            className="rounded-lg border border-[#2b2140]/8 bg-white/70 p-2.5 text-[#5b4f78]"
                          >
                            {s.page !== undefined && (
                              <span className="mr-2 inline-block rounded-md bg-[#70d6ff]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[#0c7fb0] ring-1 ring-[#70d6ff]/40">
                                page {s.page}
                              </span>
                            )}
                            <span>{s.snippet}…</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#70d6ff] to-[#ff70a6] text-[10px] font-bold text-white shadow-md ring-2 ring-white">
              AI
            </div>
            <div className="bubble-assistant flex items-center gap-1.5 rounded-2xl rounded-tl-md px-4 py-3">
              <span className="dot inline-block h-1.5 w-1.5 rounded-full bg-[#ff70a6]" />
              <span className="dot inline-block h-1.5 w-1.5 rounded-full bg-[#ff9770]" />
              <span className="dot inline-block h-1.5 w-1.5 rounded-full bg-[#70d6ff]" />
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex gap-2 border-t border-[#2b2140]/8 bg-white/50 p-3"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={docId ? "Ask a question…" : "Upload a document first"}
          disabled={disabled}
          className="flex-1 rounded-xl border border-[#2b2140]/10 bg-white px-4 py-2.5 text-sm text-[#2b2140] placeholder:text-[#5b4f78]/60 focus:border-[#ff70a6]/60 focus:outline-none focus:ring-2 focus:ring-[#ff70a6]/25 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || !input.trim()}
          className="btn-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold"
        >
          <span>Send</span>
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path d="M5 12h14m0 0l-5-5m5 5l-5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
    </div>
  );
}
