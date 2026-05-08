import { Document } from "@langchain/core/documents";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

export type SupportedExt = "pdf" | "txt" | "md";

export function detectExt(filename: string): SupportedExt | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".txt")) return "txt";
  if (lower.endsWith(".md")) return "md";
  return null;
}

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
