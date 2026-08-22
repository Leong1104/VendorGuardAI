import "server-only";

import {
  GoogleGenAI,
  type GenerateContentParameters,
  type GenerateContentResponse,
} from "@google/genai";

// Gemini handles the AI layer only: document classification, field
// extraction, and plain-language explanations. Risk findings themselves come
// from deterministic rule checks over normalized fields — never from the LLM.
let client: GoogleGenAI | undefined;

export function getGemini(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY — see .env.example");
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

// The free tier caps each model at ~20 requests/day, so quota exhaustion on
// one model must not kill a demo. Models are tried in order; per-model daily
// quotas are separate pools. Override the primary with GEMINI_MODEL.
export const GEMINI_MODELS = [
  process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
];

const RETRIABLE = /"code"\s*:\s*(429|404|500|503)/;

/** Run generateContent, falling through the model chain on quota/availability errors. */
export async function generateWithFallback(
  params: Omit<GenerateContentParameters, "model">
): Promise<{ response: GenerateContentResponse; model: string }> {
  const gemini = getGemini();
  let lastError: unknown;
  for (const model of GEMINI_MODELS) {
    try {
      const response = await gemini.models.generateContent({
        ...params,
        model,
      } as GenerateContentParameters);
      return { response, model };
    } catch (error) {
      lastError = error;
      if (RETRIABLE.test(String(error))) continue;
      throw error;
    }
  }
  throw lastError;
}
