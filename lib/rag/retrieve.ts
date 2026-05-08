import { QdrantVectorStore } from "@langchain/qdrant";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { getEmbeddings, qdrantConfig } from "./store";

export interface Source {
  page?: number;
  snippet: string;
}

export interface AnswerResult {
  answer: string;
  sources: Source[];
}

const CHAT_MODEL = "gemini-2.0-flash";
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

  const contextBlocks = results
    .map((r, i) => {
      const page = r.metadata?.loc?.pageNumber ?? r.metadata?.page;
      const tag = page ? `[chunk ${i + 1} | page ${page}]` : `[chunk ${i + 1}]`;
      return `${tag}\n${r.pageContent}`;
    })
    .join("\n\n---\n\n");

  const systemPrompt = `You are a document Q&A assistant. Answer the user's question using ONLY the context provided below, which comes from a single document the user uploaded.

Strict rules:
- If the answer is not contained in the context, reply exactly: "I don't know based on this document."
- Do not use outside knowledge.
- When useful, cite page numbers in parentheses, e.g. "(page 4)".
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

  const sources: Source[] = results.map((r) => ({
    page: r.metadata?.loc?.pageNumber ?? r.metadata?.page,
    snippet: r.pageContent.slice(0, 220),
  }));

  return { answer, sources };
}
