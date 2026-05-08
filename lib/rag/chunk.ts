import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

// Chunking strategy: RecursiveCharacterTextSplitter, 1000 chars / 200 overlap.
// Splits on paragraph -> line -> word -> char in that order, preserving
// natural document structure. Overlap prevents loss of context across splits.
export const CHUNK_SIZE = 1000;
export const CHUNK_OVERLAP = 200;

export async function chunkDocuments(
  docs: Document[],
  extra: Record<string, unknown>,
): Promise<Document[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });

  const split = await splitter.splitDocuments(docs);

  return split.map(
    (d) =>
      new Document({
        pageContent: d.pageContent,
        metadata: { ...d.metadata, ...extra },
      }),
  );
}
