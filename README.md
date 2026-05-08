# NotebookLM RAG

A minimal Google NotebookLM clone: upload a document (PDF, TXT, or MD), then chat with it. Answers are grounded only in the uploaded content using a full RAG pipeline. Runs entirely on **free tiers** — Google Gemini for embeddings and chat, Qdrant Cloud for vectors, Vercel for hosting.

## Live demo

- **App:** _add Vercel URL after deploy_
- **Repo:** _add GitHub URL_

## What it does

1. You upload a file from the browser.
2. The server parses it, splits it into overlapping text chunks, embeds each chunk with OpenAI, and stores the vectors (with `docId` metadata) in Qdrant Cloud.
3. When you ask a question, the server embeds the query, retrieves the top-k most similar chunks for that specific `docId`, builds a strict grounded prompt, and sends it to `gemini-2.0-flash`.
4. The model is instructed to answer **only** from retrieved context and cite page numbers; otherwise it replies _"I don't know based on this document."_

## Architecture

```
Browser
  │
  ├── POST /api/upload (multipart) ──► load → chunk → embed → upsert to Qdrant (with docId)
  │                                                     ▲
  │                                                     └── returns { docId, filename, numChunks }
  │
  └── POST /api/chat { docId, question } ─► embed query → retrieve top-k filtered by docId
                                              → grounded system prompt → gpt-4.1-mini
                                              → { answer, sources[] }
```

## RAG pipeline

| Stage | Implementation | File |
|---|---|---|
| Ingestion | `PDFLoader` (LangChain) for PDFs, UTF-8 read for `.txt` / `.md` | [`lib/rag/load.ts`](lib/rag/load.ts) |
| Chunking | `RecursiveCharacterTextSplitter`, 1000 chars, 200 overlap | [`lib/rag/chunk.ts`](lib/rag/chunk.ts) |
| Embedding | Google Gemini `text-embedding-004` (768 dims) | [`lib/rag/store.ts`](lib/rag/store.ts) |
| Storage | Qdrant Cloud, single collection, payload-indexed `metadata.docId` for filtered search | [`lib/rag/store.ts`](lib/rag/store.ts) |
| Retrieval | Cosine similarity, top-k = 4, filtered by `docId` | [`lib/rag/retrieve.ts`](lib/rag/retrieve.ts) |
| Generation | Google Gemini `gemini-2.0-flash` with strict grounded system prompt | [`lib/rag/retrieve.ts`](lib/rag/retrieve.ts) |

## Chunking strategy (documented)

We use LangChain's **`RecursiveCharacterTextSplitter`** with:
- `chunkSize: 1000` characters
- `chunkOverlap: 200` characters

The splitter tries separators in order — `"\n\n"` (paragraph) → `"\n"` (line) → `" "` (word) → `""` (char) — falling back only when a chunk would otherwise exceed the size limit. This preserves natural document structure: paragraphs and sentences stay intact whenever possible, so each chunk is a self-contained semantic unit suitable for embedding.

The 200-character overlap ensures that a sentence split across a chunk boundary still appears in full inside at least one chunk, so retrieval doesn't miss answers that straddle the boundary.

**Why not other strategies?**
- _Token-based splitting_ would only matter near the embedding model's token limit; at ~250 tokens per chunk we are nowhere near it.
- _Semantic chunking_ requires N extra embedding calls per document, produces uneven chunk sizes, and behaves unpredictably on PDFs with messy extracted text. For a generic NotebookLM that handles any uploaded document, the recursive splitter is more reliable.

## Multi-document isolation

Every upload gets a fresh `docId = crypto.randomUUID()`. All chunks for that doc are tagged with this `docId` in their Qdrant payload. The retrieval call passes a Qdrant filter:

```ts
{ must: [{ key: "metadata.docId", match: { value: docId } }] }
```

The `metadata.docId` field is keyword-indexed at collection creation time, so this filter is fast even at scale. This lets multiple users / multiple documents share one Qdrant collection without query crosstalk.

## Local setup

Prerequisites: Node 18+, a free Google AI Studio API key, a free Qdrant Cloud cluster.

- Google Gemini key: https://aistudio.google.com/apikey (free, no card)
- Qdrant Cloud: https://cloud.qdrant.io (free 1 GB cluster, no card)

```bash
git clone <this repo>
cd rag
npm install
cp .env.example .env.local
# Fill in GOOGLE_API_KEY, QDRANT_URL, QDRANT_API_KEY in .env.local
npm run dev
# open http://localhost:3000
```

## Deployment (Vercel)

1. Push the repo to GitHub (public).
2. Import the repo at https://vercel.com/new.
3. Add the same env vars (`GOOGLE_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`, optional `QDRANT_COLLECTION`).
4. Deploy.

Notes:
- API routes set `maxDuration = 60` so uploads up to ~10 MB finish well within the limit.
- Files are streamed into `/tmp` for PDF parsing (the only writable path on Vercel serverless) and deleted right after.

## Project structure

```
app/
  api/upload/route.ts      # multipart upload → indexDoc()
  api/chat/route.ts        # { docId, question } → answerQuestion()
  page.tsx                 # uploader + chat UI
  layout.tsx
  globals.css
components/
  Uploader.tsx
  Chat.tsx
lib/rag/
  load.ts                  # PDF / TXT / MD loader
  chunk.ts                 # RecursiveCharacterTextSplitter
  store.ts                 # Qdrant client, embeddings, ensureCollection()
  index-doc.ts             # full ingestion pipeline
  retrieve.ts              # retrieval + grounded generation
```

## Env vars

| Var | Purpose |
|---|---|
| `GOOGLE_API_KEY` | Embeddings + chat completions (Gemini) |
| `QDRANT_URL` | Qdrant Cloud endpoint (https, port 6333) |
| `QDRANT_API_KEY` | Qdrant Cloud API key |
| `QDRANT_COLLECTION` | Collection name (default: `notebooklm`) |
