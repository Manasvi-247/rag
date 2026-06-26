/**
 * Retrieval + grounded generation, with Corrective RAG (CRAG).
 *
 *   question ──► retrieve top-k ──► LLM grades each chunk (relevant / ambiguous / irrelevant)
 *                                         │
 *                  ┌──────────────────────┼────────────────────────┐
 *                  ▼                      ▼                        ▼
 *           any "relevant"         all "irrelevant"          some "ambiguous"
 *           → keep those           → rewrite query           → keep them
 *           + "ambiguous"            and retry once
 *                  │                      │                        │
 *                  └────────────► grounded prompt + Gemini ◄───────┘
 *
 * Differences from vanilla RAG:
 *   - Retrieve a small candidate pool (top-k = 4) so the grader has room to
 *     filter while keeping latency and per-call token cost low.
 *   - One Gemini call grades all chunks in JSON (cheaper than per-chunk).
 *   - If the grader rejects everything, we rewrite the query and retry the
 *     retrieval once before giving up.
 *
 * We deliberately skip CRAG's web-search fallback. The assignment requires
 * answers grounded in the uploaded document; pulling from the open web would
 * break that contract. The grading + query-rewrite steps tighten retrieval
 * without leaving the document.
 */
import { Document } from "@langchain/core/documents";
import { QdrantVectorStore } from "@langchain/qdrant";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { getEmbeddings, qdrantConfig } from "./store";

export interface Source {
  page?: number;
  row?: number;
  snippet: string;
}

export type CragMode =
  | "ok" // grader found at least one relevant/ambiguous chunk on first try
  | "rewritten" // first try was all-irrelevant; rewrote query and recovered
  | "abstain"; // even after rewrite, nothing relevant — model says "I don't know"

export interface AnswerResult {
  answer: string;
  sources: Source[];
  mode: CragMode;
  rewrittenQuery?: string;
  graded?: number; // how many chunks were graded relevant/ambiguous on the path used
}

const CHAT_MODEL = "gemini-2.5-flash-lite";
const RETRIEVE_K = 4;

function chatModel() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("Missing env var: GOOGLE_API_KEY");
  return new ChatGoogleGenerativeAI({
    model: CHAT_MODEL,
    apiKey,
    temperature: 0.1,
  });
}

async function retrieveChunks(
  question: string,
  docId: string,
): Promise<Document[]> {
  const { url, apiKey, collectionName } = qdrantConfig();
  const store = await QdrantVectorStore.fromExistingCollection(
    getEmbeddings(),
    { url, apiKey, collectionName },
  );
  return store.similaritySearch(question, RETRIEVE_K, {
    must: [{ key: "metadata.docId", match: { value: docId } }],
  });
}

type Grade = "relevant" | "ambiguous" | "irrelevant";

/**
 * Grade each retrieved chunk for relevance to the question in a single LLM
 * call. Returns the chunks paired with their grade. Falls back to treating
 * everything as "ambiguous" if the grader's output can't be parsed — we
 * never want a flaky grader to drop perfectly good context.
 */
async function gradeChunks(
  question: string,
  chunks: Document[],
): Promise<{ chunk: Document; grade: Grade }[]> {
  const numbered = chunks
    .map((c, i) => `[chunk ${i + 1}]\n${c.pageContent}`)
    .join("\n\n---\n\n");

  const prompt = `You are a strict relevance grader. For each chunk below, decide if it can help answer the question.

Output a single JSON object with keys "1" through "${chunks.length}" and string values from this exact set: "relevant", "ambiguous", "irrelevant".

- "relevant"  — clearly contains an answer or a direct fact about the question.
- "ambiguous" — possibly related but doesn't directly answer.
- "irrelevant" — not useful for this question.

Question: ${question}

Chunks:
${numbered}

Reply with ONLY the JSON object, no prose, no markdown fences.`;

  let raw: string;
  try {
    const response = await chatModel().invoke([{ role: "user", content: prompt }]);
    raw =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);
  } catch {
    return chunks.map((c) => ({ chunk: c, grade: "ambiguous" as Grade }));
  }

  // Strip code fences if the model added them despite instructions.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return chunks.map((c) => ({ chunk: c, grade: "ambiguous" as Grade }));
  }

  return chunks.map((chunk, i) => {
    const value = parsed[String(i + 1)];
    const grade: Grade =
      value === "relevant" || value === "ambiguous" || value === "irrelevant"
        ? value
        : "ambiguous";
    return { chunk, grade };
  });
}

/**
 * Rewrite the user's query to be more retrieval-friendly. Used when the
 * first retrieval + grading pass turned up nothing relevant — often the
 * original wording is too vague, conversational, or uses pronouns the
 * embedder can't ground.
 */
async function rewriteQuery(original: string): Promise<string> {
  const prompt = `Rewrite the question below so it becomes more specific and retrieval-friendly for a vector search over a document. Replace pronouns with their likely referents, expand abbreviations, and add precise nouns when the meaning is obvious from context. Keep it a single sentence. Do NOT answer the question. Reply with ONLY the rewritten question, nothing else.

Question: ${original}`;

  try {
    const response = await chatModel().invoke([{ role: "user", content: prompt }]);
    const text =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);
    return text.trim().replace(/^["']|["']$/g, "");
  } catch {
    return original;
  }
}

/** Build the labelled context the answerer sees. */
function buildContext(chunks: Document[]): string {
  return chunks
    .map((r, i) => {
      const page = r.metadata?.loc?.pageNumber ?? r.metadata?.page;
      const row = r.metadata?.row;
      const locator = page
        ? `page ${page}`
        : row !== undefined
          ? `row ${row}`
          : null;
      const tag = locator
        ? `[chunk ${i + 1} | ${locator}]`
        : `[chunk ${i + 1}]`;
      return `${tag}\n${r.pageContent}`;
    })
    .join("\n\n---\n\n");
}

async function generateGroundedAnswer(
  question: string,
  context: Document[],
): Promise<string> {
  const systemPrompt = `You are a document Q&A assistant. Answer the user's question using ONLY the context provided below, which comes from a single document the user uploaded.

Rules:
- Base every claim on the context. You MAY summarize, synthesize, and draw conclusions across multiple chunks — questions like "key takeaways", "summarize this", or "what is this about" should be answered by aggregating the relevant context, not refused.
- Only if the context contains NO information relevant to the question, reply exactly: "I don't know based on this document."
- Never use outside knowledge or invent facts that the context does not support.
- When useful, cite the source location in parentheses, e.g. "(page 4)" for PDFs or "(row 12)" for CSVs.
- Be concise and direct.

Context:
${buildContext(context)}`;

  const response = await chatModel().invoke([
    { role: "system", content: systemPrompt },
    { role: "user", content: question },
  ]);
  return typeof response.content === "string"
    ? response.content.trim()
    : JSON.stringify(response.content);
}

function chunksToSources(chunks: Document[]): Source[] {
  return chunks.map((r) => ({
    page: r.metadata?.loc?.pageNumber ?? r.metadata?.page,
    row: r.metadata?.row,
    snippet: r.pageContent.slice(0, 220),
  }));
}

export async function answerQuestion(
  docId: string,
  question: string,
): Promise<AnswerResult> {
  // --- Pass 1: retrieve + grade with the original question. ---
  const first = await retrieveChunks(question, docId);

  if (first.length === 0) {
    return {
      answer:
        "I don't have any indexed content for this document yet. Please re-upload it.",
      sources: [],
      mode: "abstain",
    };
  }

  const firstGraded = await gradeChunks(question, first);
  const firstKeep = firstGraded
    .filter((g) => g.grade !== "irrelevant")
    .map((g) => g.chunk);

  if (firstKeep.length > 0) {
    const answer = await generateGroundedAnswer(question, firstKeep);
    return {
      answer,
      sources: chunksToSources(firstKeep),
      mode: "ok",
      graded: firstKeep.length,
    };
  }

  // --- Pass 2: rewrite the question and retry once. ---
  const rewritten = await rewriteQuery(question);
  const second =
    rewritten && rewritten !== question
      ? await retrieveChunks(rewritten, docId)
      : [];

  if (second.length > 0) {
    const secondGraded = await gradeChunks(rewritten, second);
    const secondKeep = secondGraded
      .filter((g) => g.grade !== "irrelevant")
      .map((g) => g.chunk);

    if (secondKeep.length > 0) {
      const answer = await generateGroundedAnswer(question, secondKeep);
      return {
        answer,
        sources: chunksToSources(secondKeep),
        mode: "rewritten",
        rewrittenQuery: rewritten,
        graded: secondKeep.length,
      };
    }
  }

  // --- Give up cleanly. The grader rejected everything twice. ---
  return {
    answer: "I don't know based on this document.",
    sources: chunksToSources(first.slice(0, 4)),
    mode: "abstain",
    rewrittenQuery: rewritten,
  };
}
