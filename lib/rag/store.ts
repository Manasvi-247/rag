/**
 * Vector store + embeddings setup.
 *
 * - Embeddings: Google Gemini `gemini-embedding-001` (3072-dim).
 * - Storage:    Qdrant Cloud, single collection shared across all uploads.
 *               Each chunk's payload carries its `docId`, and the
 *               `metadata.docId` field is keyword-indexed at collection
 *               creation time so that filtered retrieval is fast.
 *
 * `ensureCollection()` is idempotent — it creates the collection on first
 * use and is a no-op afterwards. Called from indexDoc() before any upsert.
 */
import { QdrantClient } from "@qdrant/js-client-rest";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIM = 3072;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/** Reads Qdrant connection details from env, with a sensible default name. */
export function qdrantConfig() {
  return {
    url: env("QDRANT_URL"),
    apiKey: env("QDRANT_API_KEY"),
    collectionName: process.env.QDRANT_COLLECTION || "notebooklm",
  };
}

export function getEmbeddings() {
  return new GoogleGenerativeAIEmbeddings({
    model: EMBEDDING_MODEL,
    apiKey: env("GOOGLE_API_KEY"),
  });
}

export function getQdrantClient() {
  const { url, apiKey } = qdrantConfig();
  return new QdrantClient({ url, apiKey });
}

/**
 * Create the collection on first use; no-op if it already exists.
 *
 * Also creates a keyword index on `metadata.docId` so that the filtered
 * similarity search in retrieve.ts is fast (otherwise Qdrant scans every
 * point's payload).
 */
export async function ensureCollection() {
  const { collectionName } = qdrantConfig();
  const client = getQdrantClient();

  const exists = await client.collectionExists(collectionName);
  if (exists.exists) return;

  await client.createCollection(collectionName, {
    vectors: { size: EMBEDDING_DIM, distance: "Cosine" },
  });

  await client.createPayloadIndex(collectionName, {
    field_name: "metadata.docId",
    field_schema: "keyword",
  });
}
