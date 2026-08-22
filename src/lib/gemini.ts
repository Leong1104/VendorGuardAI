import "server-only";

import { GoogleGenAI } from "@google/genai";

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

export const GEMINI_MODEL = "gemini-3.6-flash";
