/**
 * Document loading — turns a raw uploaded File into LangChain `Document[]`.
 *
 * - PDF: parsed with `@langchain/community` PDFLoader, which writes to a temp
 *   path and uses pdf-parse under the hood. This produces one Document per page,
 *   with `metadata.loc.pageNumber` set — used later for citations.
 * - TXT / MD: read as UTF-8 into a single Document.
 * - CSV: parsed in-process (no extra deps); one Document per data row, with
 *   `metadata.row` set so retrieved chunks can be cited by row number.
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

export type SupportedExt = "pdf" | "txt" | "md" | "csv";

/** Returns the file's extension if it's one we support, else null. */
export function detectExt(filename: string): SupportedExt | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".txt")) return "txt";
  if (lower.endsWith(".md")) return "md";
  if (lower.endsWith(".csv")) return "csv";
  return null;
}

/**
 * Minimal CSV parser. Handles:
 * - quoted fields ("...")
 * - escaped quotes inside quoted fields ("")
 * - commas and newlines inside quoted fields
 * - both LF and CRLF line endings
 *
 * Returns rows as string[][]. No header detection — the first row is treated
 * as headers by `loadDocuments`.
 */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(cell);
        cell = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell);
        cell = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else {
        cell += c;
      }
    }
  }
  // Flush trailing cell/row if file didn't end with a newline.
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
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

  if (ext === "csv") {
    const rows = parseCSV(text);
    if (rows.length === 0) return [];

    // First row is the header; remaining rows become Documents.
    const headers = rows[0].map((h) => h.trim());
    const dataRows = rows.slice(1);

    if (dataRows.length === 0) {
      // Header-only CSV — emit one Document with just the header line.
      return [
        new Document({
          pageContent: `Columns: ${headers.join(", ")}`,
          metadata: { source: filename },
        }),
      ];
    }

    return dataRows.map((cells, idx) => {
      const lines = headers.map((h, i) => `${h}: ${cells[i] ?? ""}`);
      return new Document({
        pageContent: `Row ${idx + 1}\n${lines.join("\n")}`,
        metadata: { source: filename, row: idx + 1 },
      });
    });
  }

  return [
    new Document({
      pageContent: text,
      metadata: { source: filename },
    }),
  ];
}
