/**
 * Chunking — splits loaded Documents into overlapping passages for embedding.
 *
 * Strategy: RecursiveCharacterTextSplitter with chunkSize=1000, overlap=200.
 *
 *   The splitter tries separators in order — paragraph, line, word, char —
 *   and only falls back to the next when a chunk would otherwise exceed the
 *   size limit. This preserves the document's natural structure: paragraphs
 *   and sentences stay intact whenever possible, so each chunk is a coherent
 *   semantic unit suitable for embedding.
 *
 *   The 200-char overlap ensures a sentence split across a chunk boundary
 *   still appears in full inside at least one chunk, so retrieval doesn't
 *   miss answers that straddle the boundary.
 *
 * Each emitted chunk carries forward the source Document's metadata (e.g.
 * pageNumber for PDFs) plus any extra metadata passed by the caller — we
 * use this to attach { docId, filename } so retrieval can filter by document.
 */
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

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
