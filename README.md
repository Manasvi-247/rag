<div align="center">

# 📒 NotebookLM RAG

**Upload any document. Ask anything. Get grounded answers.**

A minimal Google NotebookLM clone — a full Retrieval-Augmented Generation pipeline that runs entirely on free tiers.

[![Live](https://img.shields.io/badge/live-rag--woad--three.vercel.app-ff70a6?style=for-the-badge)](https://rag-woad-three.vercel.app/)
[![Repo](https://img.shields.io/badge/source-Manasvi--247%2Frag-70d6ff?style=for-the-badge&logo=github)](https://github.com/Manasvi-247/rag)
[![Stack](https://img.shields.io/badge/stack-Next.js%20·%20Gemini%20·%20Qdrant-ff9770?style=for-the-badge)](#-tech-stack)

By [@Manasvi-247](https://github.com/Manasvi-247)

</div>

---

## ✨ Features

- 📄 **Upload** PDF, TXT, or MD (up to 10 MB)
- ✂️ **Chunked** with `RecursiveCharacterTextSplitter` (1000/200) — paragraph-aware
- 🧠 **Embedded** with Google Gemini `gemini-embedding-001` (3072 dims)
- 🗄️ **Stored** in Qdrant Cloud, payload-indexed by `docId` for multi-doc isolation
- 🔍 **Retrieved** by cosine similarity, top-k = 4, filtered to a single document
- 🎯 **Grounded** answers — strict prompt; the model says _"I don't know"_ if context is missing
- 📍 **Cited** with page numbers when the source is a PDF
- 💸 **$0** to run — Gemini free tier + Qdrant free cluster + Vercel Hobby

## 🚀 Live demo

> https://rag-woad-three.vercel.app/

Open the link, drop a PDF, ask a question. No login required.

## 🧱 Tech stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, Tailwind CSS |
| API | Next.js Route Handlers (Node runtime) |
| Document loading | `@langchain/community` `PDFLoader`, native UTF-8 read |
| Chunking | `@langchain/textsplitters` — `RecursiveCharacterTextSplitter` |
| Embeddings | Google Gemini `gemini-embedding-001` (3072-dim) |
| Vector store | Qdrant Cloud, REST + LangChain `QdrantVectorStore` |
| LLM | Google Gemini `gemini-2.5-flash-lite` |
| Hosting | Vercel |

## 🏛️ Architecture

```
            ┌──────────────────┐
            │     Browser      │
            └─────┬──────┬─────┘
                  │      │
   POST /api/upload      POST /api/chat
   (multipart)           ({ docId, question })
                  │      │
                  ▼      ▼
       ┌─────────────────────────┐
       │   Next.js API routes    │
       │  (Node, maxDuration 60) │
       └─────┬─────────────┬─────┘
             │             │
   ┌─────────▼──┐    ┌────▼──────────────┐
   │ load → chunk│   │ embed query        │
   │ → embed →   │   │ → similaritySearch │
   │ upsert      │   │   (filter docId)   │
   │             │   │ → grounded prompt  │
   │             │   │ → Gemini chat      │
   └─────┬───────┘   └────┬───────────────┘
         │                │
         ▼                ▼
    ┌──────────┐    ┌──────────────┐
    │ Qdrant   │    │  Gemini API  │
    │  Cloud   │    │              │
    └──────────┘    └──────────────┘
```

## 🔁 RAG pipeline

| Stage | Implementation | File |
|---|---|---|
| **Ingestion** | `PDFLoader` (LangChain) for PDFs, UTF-8 read for `.txt` / `.md` | [`lib/rag/load.ts`](lib/rag/load.ts) |
| **Chunking** | `RecursiveCharacterTextSplitter`, 1000 chars, 200 overlap | [`lib/rag/chunk.ts`](lib/rag/chunk.ts) |
| **Embedding** | Google Gemini `gemini-embedding-001` (3072 dims) | [`lib/rag/store.ts`](lib/rag/store.ts) |
| **Storage** | Qdrant Cloud, single collection, payload-indexed `metadata.docId` | [`lib/rag/store.ts`](lib/rag/store.ts) |
| **Retrieval** | Cosine similarity, top-k = 4, filtered by `docId` | [`lib/rag/retrieve.ts`](lib/rag/retrieve.ts) |
| **Generation** | `gemini-2.5-flash-lite` with strict grounded system prompt | [`lib/rag/retrieve.ts`](lib/rag/retrieve.ts) |

## ✂️ Chunking strategy

We use LangChain's **`RecursiveCharacterTextSplitter`** with:

| Parameter | Value | Why |
|---|---|---|
| `chunkSize` | **1000 chars** (~250 tokens) | Big enough to be self-contained, small enough for precise retrieval |
| `chunkOverlap` | **200 chars** | Sentences split across boundaries still appear whole inside at least one chunk |
| Separators (in order) | `"\n\n"` → `"\n"` → `" "` → `""` | Paragraph → line → word → char fallback, preserving natural document structure |

The recursive splitter tries the largest separator first and only falls back when a chunk would otherwise exceed the size limit. The result: paragraphs and sentences stay intact whenever possible, so each chunk is a coherent semantic unit.

**Why not other strategies?**

- **Token-based splitting** matters only near the embedding model's token limit. At ~250 tokens per chunk we are nowhere near it, so the extra `tiktoken` dependency buys nothing.
- **Semantic chunking** sounds smart but: (a) requires an extra embedding call per sentence, (b) produces uneven chunk sizes, (c) misbehaves on PDFs with messy extracted text (tables, headers, footers). For a generic NotebookLM that handles any uploaded document, recursive character splitting is more reliable.

## 🔒 Multi-document isolation

Every upload gets a fresh `docId = crypto.randomUUID()`. All chunks for that document are tagged with this `docId` in their Qdrant payload. Retrieval filters by `docId` so queries never leak across documents:

```ts
const results = await store.similaritySearch(question, 4, {
  must: [{ key: "metadata.docId", match: { value: docId } }],
});
```

The `metadata.docId` field is **keyword-indexed at collection creation time** ([`lib/rag/store.ts`](lib/rag/store.ts)), so this filter is fast even at scale. Multiple users / multiple documents share one Qdrant collection without query crosstalk.

## 📁 Project structure

```
app/
├── api/
│   ├── upload/route.ts       # POST: multipart → indexDoc()
│   └── chat/route.ts         # POST: { docId, question } → answerQuestion()
├── page.tsx                  # main UI: uploader + chat
├── layout.tsx
└── globals.css               # Tailwind + custom palette
components/
├── Uploader.tsx              # drag & drop file uploader
└── Chat.tsx                  # message list + composer
lib/rag/
├── load.ts                   # PDF / TXT / MD → LangChain Documents
├── chunk.ts                  # RecursiveCharacterTextSplitter
├── store.ts                  # Qdrant client, embeddings, ensureCollection()
├── index-doc.ts              # full ingestion pipeline
└── retrieve.ts               # retrieval + grounded generation
```

## ⚙️ Local setup

**Prerequisites**: Node 18+, a free Google AI Studio API key, a free Qdrant Cloud cluster.

| Service | Where | Notes |
|---|---|---|
| Google Gemini | https://aistudio.google.com/apikey | Free, no credit card |
| Qdrant Cloud | https://cloud.qdrant.io | Free 1 GB cluster, no credit card |

```bash
git clone https://github.com/Manasvi-247/rag.git
cd rag
npm install
cp .env.example .env.local
# Fill in GOOGLE_API_KEY, QDRANT_URL, QDRANT_API_KEY in .env.local
npm run dev
# open http://localhost:3000
```

> If port 3000 is busy: `npm run dev -- -p 3010`

## ☁️ Deployment (Vercel)

1. Push the repo to GitHub (public).
2. Import the repo at https://vercel.com/new.
3. Add env vars under **Settings → Environment Variables**:
   `GOOGLE_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`, optional `QDRANT_COLLECTION`.
4. Deploy.

**Operational notes**

- API routes set `runtime = "nodejs"` and `maxDuration = 60` so uploads up to ~10 MB finish well within the timeout.
- PDFs are streamed to `/tmp` for parsing (the only writable path on Vercel serverless) and deleted immediately after.
- The Qdrant collection is **created on first upload** if it doesn't exist — no migration step needed.

## 🔧 Environment variables

| Var | Purpose | Example |
|---|---|---|
| `GOOGLE_API_KEY` | Gemini embeddings + chat | `AIza...` |
| `QDRANT_URL` | Qdrant Cloud endpoint | `https://xyz.aws.cloud.qdrant.io:6333` |
| `QDRANT_API_KEY` | Qdrant Cloud API key | `eyJhbGciOi...` |
| `QDRANT_COLLECTION` | Collection name (optional) | `notebooklm` _(default)_ |

