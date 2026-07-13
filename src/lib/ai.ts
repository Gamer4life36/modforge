// Minimal Anthropic (Claude) client for the AI side-panel.
// The API key is stored locally on the user's machine and never leaves it
// except in the direct request to Anthropic.

const KEY_STORAGE = "modforge.anthropic_key";
const MODEL_STORAGE = "modforge.model";

export const MODELS = [
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 (balanced)" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 (most capable)" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (fastest)" },
];

export function getApiKey(): string {
  return localStorage.getItem(KEY_STORAGE) ?? "";
}
export function setApiKey(k: string): void {
  localStorage.setItem(KEY_STORAGE, k.trim());
}
export function getModel(): string {
  return localStorage.getItem(MODEL_STORAGE) ?? MODELS[0].id;
}
export function setModel(m: string): void {
  localStorage.setItem(MODEL_STORAGE, m);
}
export function hasKey(): boolean {
  return getApiKey().length > 0;
}

export class NoKeyError extends Error {
  constructor() {
    super("No Anthropic API key set. Add one in the AI panel settings.");
  }
}

/** Send a single-turn prompt to Claude and return the text response. */
export async function askAI(system: string, user: string): Promise<string> {
  const key = getApiKey();
  if (!key) throw new NoKeyError();

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      // Required for calling the API directly from an app webview.
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: getModel(),
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  return (data.content ?? [])
    .map((b) => b.text ?? "")
    .join("")
    .trim();
}

export const SYSTEM_PROMPT =
  "You are a modding assistant embedded in a desktop tool. The user is editing a " +
  "game config/data/save file. Explain what fields do in plain language, flag risky " +
  "edits, and suggest concrete values. Be concise and practical. When you suggest a " +
  "change, name the exact field path and the value. Never invent fields that aren't " +
  "in the provided content.";
