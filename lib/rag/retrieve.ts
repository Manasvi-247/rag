/**
 * Retrieval + grounded generation — the "answer" half of the RAG flow.
 *
 *   question ──► embed ──► top-k similarity (filtered by docId)
 *                  └──► strict grounded prompt ──► Gemini chat ──► answer + sources
 *
 * Grounding strategy:
 * - The system prompt instructs the model to answer ONLY from the supplied
 *   context blocks and to reply "I don't know based on this document" when
 *   the answer isn't present. This is what makes the assistant resistant to
 *   hallucination — it has no incentive to draw on its training knowledge.
 * - Each retrieved chunk is labelled with its page number (when available)
 *   so the model can cite pages, and the response object also includes
 *   structured `sources[]` for the UI to render.
 *
 * The Qdrant filter `must: [{ key: "metadata.docId", match: { value: docId } }]`
 * keeps multiple users' uploads cleanly isolated inside a single collection.
 */
import { QdrantVectorStore } from "@langchain/qdrant";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { getEmbeddings, qdrantConfig } from "./store";

export interface Source {
  page?: number;
  row?: number;
  snippet: string;
}

export interface AnswerResult {
  answer: string;
  sources: Source[];
}

const CHAT_MODEL = "gemini-2.5-flash-lite";
const TOP_K = 4;

export async function answerQuestion(
  docId: string,
  question: string,
): Promise<AnswerResult> {
  const { url, apiKey, collectionName } = qdrantConfig();

  const store = await QdrantVectorStore.fromExistingCollection(
    getEmbeddings(),
    { url, apiKey, collectionName },
  );

  const results = await store.similaritySearch(question, TOP_K, {
    must: [{ key: "metadata.docId", match: { value: docId } }],
  });

  if (results.length === 0) {
    return {
      answer:
        "I don't have any indexed content for this document yet. Please re-upload it.",
      sources: [],
    };
  }

  // Build labelled context blocks. The label gives the model a stable handle
  // for citation ("page 4" / "row 12") and helps it disambiguate between chunks.
  const contextBlocks = results
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

  const systemPrompt = `You are a document Q&A assistant. Answer the user's question using ONLY the context provided below, which comes from a single document the user uploaded.

Strict rules:
- If the answer is not contained in the context, reply exactly: "I don't know based on this document."
- Do not use outside knowledge.
- When useful, cite the source location in parentheses, e.g. "(page 4)" for PDFs or "(row 12)" for CSVs.
- Be concise and direct.

Context:
${contextBlocks}`;

  const googleApiKey = process.env.GOOGLE_API_KEY;
  if (!googleApiKey) throw new Error("Missing env var: GOOGLE_API_KEY");

  const model = new ChatGoogleGenerativeAI({
    model: CHAT_MODEL,
    apiKey: googleApiKey,
    temperature: 0.2,
  });

  const response = await model.invoke([
    { role: "system", content: systemPrompt },
    { role: "user", content: question },
  ]);

  const answer =
    typeof response.content === "string"
      ? response.content.trim()
      : JSON.stringify(response.content);

  // Trim each chunk to a short preview for the UI's source list.
  const sources: Source[] = results.map((r) => ({
    page: r.metadata?.loc?.pageNumber ?? r.metadata?.page,
    row: r.metadata?.row,
    snippet: r.pageContent.slice(0, 220),
  }));

  return { answer, sources };
}
