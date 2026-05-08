import { NextResponse } from "next/server";
import { indexDoc } from "@/lib/rag/index-doc";
import { detectExt } from "@/lib/rag/load";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!detectExt(file.name)) {
      return NextResponse.json(
        { error: "Only PDF, TXT, and MD files are supported" },
        { status: 400 },
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File exceeds 10 MB limit" },
        { status: 400 },
      );
    }

    const result = await indexDoc(file, file.name);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("upload failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
