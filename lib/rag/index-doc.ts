/**
 * Indexing pipeline — the "ingest" half of the RAG flow.
 *
 *   File ──► load ──► chunk ──► embed ──► upsert (Qdrant)
 *
 * Steps:
 * 1. Ensure the Qdrant collection exists (created at 3072-dim cosine).
 * 2. Generate a fresh `docId` so this upload is queryable in isolation.
 * 3. Load + chunk + tag every chunk with { docId, filename } metadata.
 * 4. Probe a single embedding first — if the API key is missing/invalid
 *    we fail with a clear error message instead of letting Qdrant complain
 *    about zero-length vectors.
 * 5. Upsert all chunks.
 *
 * Returns { docId, filename, numChunks } so the client can use the docId
 * as the conversation handle.
 */
import { randomUUID } from "crypto";
import { QdrantVectorStore } from "@langchain/qdrant";
import { loadDocuments } from "./load";
import { chunkDocuments } from "./chunk";
import {
  EMBEDDING_DIM,
  ensureCollection,
  getEmbeddings,
  qdrantConfig,
} from "./store";

export interface IndexResult {
  docId: string;
  filename: string;
  numChunks: number;
}

export async function indexDoc(
  file: File,
  filename: string,
): Promise<IndexResult> {
  await ensureCollection();

  const docId = randomUUID();
  const rawDocs = await loadDocuments(file, filename);
  const chunks = await chunkDocuments(rawDocs, { docId, filename });

  if (chunks.length === 0) {
    throw new Error(
      "Document produced 0 chunks — the file may be empty or unreadable.",
    );
  }

  const embeddings = getEmbeddings();

  // Probe one embedding before bulk upsert so misconfiguration surfaces here
  // rather than as a confusing dimension-mismatch from Qdrant.
  const probe = await embeddings.embedQuery(chunks[0].pageContent);
  if (!probe || probe.length === 0) {
    throw new Error(
      "Gemini embedding returned an empty vector. Check that GOOGLE_API_KEY is set correctly in your environment.",
    );
  }
  if (probe.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding dimension mismatch: expected ${EMBEDDING_DIM}, got ${probe.length}. Update EMBEDDING_DIM in lib/rag/store.ts.`,
    );
  }

  const { url, apiKey, collectionName } = qdrantConfig();
  await QdrantVectorStore.fromDocuments(chunks, embeddings, {
    url,
    apiKey,
    collectionName,
  });

  return { docId, filename, numChunks: chunks.length };
}
