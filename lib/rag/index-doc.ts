import { randomUUID } from "crypto";
import { QdrantVectorStore } from "@langchain/qdrant";
import { loadDocuments } from "./load";
import { chunkDocuments } from "./chunk";
import { ensureCollection, getEmbeddings, qdrantConfig } from "./store";

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

  const { url, apiKey, collectionName } = qdrantConfig();
  await QdrantVectorStore.fromDocuments(chunks, getEmbeddings(), {
    url,
    apiKey,
    collectionName,
  });

  return { docId, filename, numChunks: chunks.length };
}
