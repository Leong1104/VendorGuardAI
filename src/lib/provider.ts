// Chooses the AI layer implementation. "gemini" calls the Gemini API for
// classification/extraction/explanation; "local" runs the deterministic
// text-layer parser and template narrator in-process, with no external
// service or API key. Risk findings are deterministic in both modes.
//
// Selection: AI_PROVIDER wins when set; otherwise Gemini is used only when
// a key is configured, so the app works out of the box with no secrets.
export type AiProvider = "gemini" | "local";

export function getAiProvider(): AiProvider {
  const forced = process.env.AI_PROVIDER;
  if (forced === "local" || forced === "gemini") return forced;
  return process.env.GEMINI_API_KEY ? "gemini" : "local";
}
