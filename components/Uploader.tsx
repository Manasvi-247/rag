"use client";

import { useRef, useState } from "react";

interface Props {
  onIndexed: (info: { docId: string; filename: string; numChunks: number }) => void;
}

export default function Uploader({ onIndexed }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    setBusy(true);
    setError(null);
    setProgress(`Indexing ${file.name}…`);

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setProgress(null);
      onIndexed(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setProgress(null);
    } finally {
      setBusy(false);
    }
  }

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  }

  return (
    <div
      className={`glass relative overflow-hidden rounded-2xl p-5 transition ${
        dragOver ? "ring-2 ring-[#ff70a6]/60" : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[#ff70a6]/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-12 h-36 w-36 rounded-full bg-[#70d6ff]/30 blur-3xl" />
      <div className="pointer-events-none absolute right-8 bottom-4 h-20 w-20 rounded-full bg-[#ffd670]/30 blur-2xl" />

      <div className="relative">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#5b4f78]">
            Upload
          </span>
          <span className="chip rounded-full px-2 py-0.5 text-[10px] font-medium">
            PDF · TXT · MD · 10 MB
          </span>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="group mt-3 flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#2b2140]/15 bg-white/50 px-4 py-7 text-center transition hover:border-[#ff70a6]/60 hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#ff70a6] via-[#ff9770] to-[#ffd670] shadow-lg shadow-[#ff70a6]/30 ring-2 ring-white">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-white">
              <path d="M12 16V4m0 0l-4 4m4-4l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-[#2b2140]">
            {busy ? "Working…" : "Drop a file or click to browse"}
          </p>
          <p className="text-[11px] text-[#5b4f78]">
            Your document is chunked, embedded, and stored.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.txt,.md"
            className="hidden"
            disabled={busy}
            onChange={handleSelect}
          />
        </button>

        {progress && (
          <div className="animate-fade-up mt-3 flex items-center gap-2 rounded-lg bg-[#70d6ff]/15 px-3 py-2 text-xs font-medium text-[#0c7fb0] ring-1 ring-[#70d6ff]/40">
            <span className="flex gap-1">
              <span className="dot inline-block h-1.5 w-1.5 rounded-full bg-[#0c7fb0]" />
              <span className="dot inline-block h-1.5 w-1.5 rounded-full bg-[#0c7fb0]" />
              <span className="dot inline-block h-1.5 w-1.5 rounded-full bg-[#0c7fb0]" />
            </span>
            {progress}
          </div>
        )}

        {error && (
          <div className="animate-fade-up mt-3 rounded-lg bg-[#ff70a6]/15 px-3 py-2 text-xs font-medium text-[#b03070] ring-1 ring-[#ff70a6]/40">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
