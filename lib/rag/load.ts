/**
 * Document loading — turns a raw uploaded File into LangChain `Document[]`.
 *
 * - PDF: parsed with `@langchain/community` PDFLoader, which writes to a temp
 *   path and uses pdf-parse under the hood. This produces one Document per page,
 *   with `metadata.loc.pageNumber` set — used later for citations.
 * - TXT / MD: read as UTF-8 into a single Document.
 *
 * The PDF temp file is written to the OS temp dir (the only writable path on
 * Vercel serverless) and unlinked immediately after the loader finishes.
 */
import { Document } from "@langchain/core/documents";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

export type SupportedExt = "pdf" | "txt" | "md";

/** Returns the file's extension if it's one we support, else null. */
export function detectExt(filename: string): SupportedExt | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".txt")) return "txt";
  if (lower.endsWith(".md")) return "md";
  return null;
}

/**
 * Convert a browser-uploaded File into LangChain Documents ready for chunking.
 * Throws if the extension isn't supported.
 */
export async function loadDocuments(
  file: File,
  filename: string,
): Promise<Document[]> {
  const ext = detectExt(filename);
  if (!ext) {
    throw new Error(`Unsupported file type: ${filename}`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (ext === "pdf") {
    const tmpPath = join(tmpdir(), `${randomUUID()}.pdf`);
    await writeFile(tmpPath, buffer);
    try {
      const loader = new PDFLoader(tmpPath);
      return await loader.load();
    } finally {
      await unlink(tmpPath).catch(() => {});
    }
  }

  const text = buffer.toString("utf-8");
  return [
    new Document({
      pageContent: text,
      metadata: { source: filename },
    }),
  ];
}
