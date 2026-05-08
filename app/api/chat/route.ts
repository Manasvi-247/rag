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
