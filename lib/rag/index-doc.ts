/**
 * Indexing pipeline — the "ingest" half of the RAG flow.
 *
 *   File ──► load ──► chunk ──► embed (batched) ──► filter empties ──► upsert (Qdrant)
 *
 * Steps:
 * 1. Ensure the Qdrant collection exists (created at the embedding-model's
 *    dim with cosine distance).
 * 2. Generate a fresh `docId` so this upload is queryable in isolation.
 * 3. Load + chunk + tag every chunk with { docId, filename } metadata.
 * 4. Embed all chunks in one call (LangChain internally uses Gemini's
 *    `batchEmbedContents` which handles up to 100 inputs per request).
 * 5. **Filter out any chunks whose embedding came back empty** — Gemini's
 *    safety filter or transient errors can return [] for individual items
 *    in a batch. Without this filter Qdrant rejects the whole upsert with
 *    a dimension-mismatch error.
 * 6. Upsert valid points to Qdrant in batches of 100 using a payload shape
 *    compatible with LangChain's `QdrantVectorStore` ({ content, metadata })
 *    so retrieval keeps working.
 */
import { randomUUID } from "crypto";
import { loadDocuments } from "./load";
import { chunkDocuments } from "./chunk";
import {
  EMBEDDING_DIM,
  ensureCollection,
  getEmbeddings,
  getQdrantClient,
  qdrantConfig,
} from "./store";

export interface IndexResult {
  docId: string;
  filename: string;
  numChunks: number;
  dropped?: number;
}

export async function indexDoc(
  file: File,
  filename: string,
): Promise<IndexResult> {
  await ensureCollection();

  const docId = randomUUID();
  const rawDocs = await loadDocuments(file, filename);
  const chunks = await chunkDocuments(rawDocs, { docId, filename });

  // Skip empty/whitespace-only chunks (Gemini returns empty embeddings for
  // these and pollutes the upsert).
  const nonEmpty = chunks.filter((c) => c.pageContent.trim().length > 0);

  if (nonEmpty.length === 0) {
    throw new Error(
      "Document produced 0 usable chunks — the file may be empty or unreadable.",
    );
  }

  const embeddings = getEmbeddings();

  // Embed all chunks. @langchain/google-genai batches internally via
  // batchEmbedContents (up to 100 items per request).
  const vectors = await embeddings.embedDocuments(
    nonEmpty.map((c) => c.pageContent),
  );

  // Pair chunks with their embeddings and drop any that came back empty or
  // dim-mismatched. This is the defensive step that prevents the
  // "dim: 3072, got 0" error from killing the whole upload.
  const valid = nonEmpty
    .map((chunk, i) => ({ chunk, vector: vectors[i] }))
    .filter(
      (p) => Array.isArray(p.vector) && p.vector.length === EMBEDDING_DIM,
    );

  const dropped = nonEmpty.length - valid.length;
  if (dropped > 0) {
    console.warn(
      `Dropped ${dropped} chunk(s) with empty/invalid embeddings from Gemini.`,
    );
  }

  if (valid.length === 0) {
    throw new Error(
      "All embeddings came back empty. Check GOOGLE_API_KEY and that the embedding model is available on your account.",
    );
  }

  // Upsert directly to Qdrant. The payload shape ({ content, metadata })
  // matches what LangChain's QdrantVectorStore writes, so retrieval via
  // similaritySearch continues to work unchanged.
  const { collectionName } = qdrantConfig();
  const client = getQdrantClient();

  const BATCH = 100;
  for (let i = 0; i < valid.length; i += BATCH) {
    const slice = valid.slice(i, i + BATCH);
    await client.upsert(collectionName, {
      wait: true,
      points: slice.map(({ chunk, vector }) => ({
        id: randomUUID(),
        vector,
        payload: {
          content: chunk.pageContent,
          metadata: chunk.metadata,
        },
      })),
    });
  }

  return {
    docId,
    filename,
    numChunks: valid.length,
    ...(dropped > 0 ? { dropped } : {}),
  };
}
