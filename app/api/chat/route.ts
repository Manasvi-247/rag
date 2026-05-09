/**
 * POST /api/chat
 *
 * Accepts JSON `{ docId, question }` and returns a grounded answer plus
 * structured `sources[]` (page + snippet) drawn from the indexed document.
 *
 * Delegates to `answerQuestion()` which embeds the query, retrieves the
 * top-k chunks for that docId from Qdrant, and asks Gemini to answer
 * strictly from that context.
 *
 * Response: { answer, sources } on success, { error } on failure.
 */
import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/rag/retrieve";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { docId, question } = body ?? {};

    if (typeof docId !== "string" || typeof question !== "string") {
      return NextResponse.json(
        { error: "docId and question are required" },
        { status: 400 },
      );
    }

    if (!question.trim()) {
      return NextResponse.json(
        { error: "Question is empty" },
        { status: 400 },
      );
    }

    const result = await answerQuestion(docId, question.trim());
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("chat failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
