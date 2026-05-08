"use client";

import { useState } from "react";
import Uploader from "@/components/Uploader";
import Chat from "@/components/Chat";

export default function Home() {
  const [doc, setDoc] = useState<{ docId: string; filename: string; numChunks: number } | null>(null);

  return (
    <main className="relative z-10 mx-auto flex h-screen max-w-6xl flex-col gap-5 p-4 md:p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff70a6] via-[#ff9770] to-[#ffd670] shadow-lg shadow-[#ff70a6]/40">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-white">
              <path d="M4 6h12a4 4 0 014 4v8a2 2 0 01-2 2H8a4 4 0 01-4-4V6z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              <path d="M8 10h6M8 14h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight md:text-2xl">
              <span className="gradient-text">NotebookLM</span>{" "}
              <span className="text-[#2b2140]">RAG</span>
            </h1>
            <p className="text-xs text-[#5b4f78]">
              Upload a document &middot; ask grounded questions
            </p>
          </div>
        </div>
        <a
          href="https://github.com/"
          target="_blank"
          rel="noreferrer"
          className="hidden items-center gap-2 rounded-full border border-[#2b2140]/10 bg-white/70 px-3 py-1.5 text-xs font-medium text-[#2b2140] shadow-sm transition hover:bg-white md:inline-flex"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          Source
        </a>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-5 md:grid-cols-[340px_1fr]">
        <aside className="flex flex-col gap-4">
          <Uploader onIndexed={setDoc} />

          {doc ? (
            <div className="glass animate-fade-up rounded-2xl p-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#5b4f78]">
                  Indexed
                </span>
                <span className="rounded-full bg-[#70d6ff]/20 px-2 py-0.5 text-[10px] font-semibold text-[#0c7fb0] ring-1 ring-[#70d6ff]/50">
                  ready
                </span>
              </div>
              <p className="mt-3 truncate text-sm font-medium text-[#2b2140]">{doc.filename}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-[#2b2140]/8 bg-gradient-to-br from-[#ff70a6]/10 to-[#ff9770]/10 p-2">
                  <p className="text-[10px] uppercase tracking-wider text-[#5b4f78]">Chunks</p>
                  <p className="text-base font-bold text-[#2b2140]">{doc.numChunks}</p>
                </div>
                <div className="rounded-lg border border-[#2b2140]/8 bg-gradient-to-br from-[#70d6ff]/15 to-[#ffd670]/15 p-2">
                  <p className="text-[10px] uppercase tracking-wider text-[#5b4f78]">Doc ID</p>
                  <p className="font-mono text-xs text-[#2b2140]">{doc.docId.slice(0, 8)}…</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass rounded-2xl p-4 text-xs text-[#5b4f78]">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#5b4f78]">
                How it works
              </p>
              <ol className="mt-3 space-y-2.5">
                <li className="flex items-center gap-2">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#ff70a6] text-[10px] font-bold text-white">1</span>
                  Upload a PDF, TXT, or MD.
                </li>
                <li className="flex items-center gap-2">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#ff9770] text-[10px] font-bold text-white">2</span>
                  We chunk &amp; embed it into Qdrant.
                </li>
                <li className="flex items-center gap-2">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#70d6ff] text-[10px] font-bold text-white">3</span>
                  Ask anything — answers cite pages.
                </li>
              </ol>
            </div>
          )}
        </aside>

        <section className="min-h-[60vh]">
          <Chat docId={doc?.docId ?? null} filename={doc?.filename ?? null} />
        </section>
      </div>

      <footer className="text-center text-[11px] text-[#5b4f78]">
        Grounded retrieval &middot; text-embedding-004 &middot; gemini-2.0-flash
      </footer>
    </main>
  );
}
