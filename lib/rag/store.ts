import { QdrantClient } from "@qdrant/js-client-rest";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

// Gemini's text-embedding-004 produces 768-dim vectors.
export const EMBEDDING_MODEL = "text-embedding-004";
export const EMBEDDING_DIM = 768;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

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

// Idempotent: creates collection on first use, no-op afterwards.
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
