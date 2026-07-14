// Minimal AI client (Anthropic API) for the AI side-panel.
// The API key is stored locally on the user's machine and never leaves it
// except in the direct request to Anthropic.

const KEY_STORAGE = "modforge.anthropic_key";
const MODEL_STORAGE = "modforge.model";

export const MODELS = [
  { id: "claude-sonnet-5", label: "Balanced (recommended)" },
  { id: "claude-opus-4-8", label: "Most capable" },
  { id: "claude-haiku-4-5-20251001", label: "Fastest" },
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

/** Send a single-turn prompt to the AI and return the text response. */
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

// ---- AI Save Agent: turn a plain-English goal into concrete field edits ----

/** One field surfaced from a binary save, as seen by the agent. */
export interface AgentField {
  index: number;
  label: string; // className.member (or resource #key)
  kind: "i32" | "u32" | "bool";
  value: number;
  category: string;
}

/** A concrete edit the agent proposes, referencing a scanned field by index. */
export interface AgentEdit {
  index: number;
  newValue: number;
  reason: string;
}

const AGENT_SYSTEM =
  "You are ModForge's Save Agent. You are given a list of editable fields extracted " +
  "from a single-player OFFLINE game save (each with an index, a class.member label, a " +
  "type, its current value, and a rough category), plus the user's goal in plain " +
  "English. Decide which fields to change and to what.\n\n" +
  "Rules:\n" +
  "- ONLY reference fields by an index that appears in the list. Never invent fields.\n" +
  "- For 'max' / 'give me lots' goals, a safe generous value is 10000 (not 2^31 — huge " +
  "values can overflow or crash a save). For level/tier fields, be conservative: do not " +
  "exceed a level that already appears among similar fields unless the user gave a number.\n" +
  "- For boolean unlock flags, use 1 to enable / 0 to disable.\n" +
  "- Prefer editing gameplay values (currency, resources, health, levels). Do NOT touch " +
  "fields that look like purchase receipts / real-money IAP ledgers; if the goal requires " +
  "that, skip it and say so in a reason.\n" +
  "- Keep the change set tight — only fields that serve the goal.\n\n" +
  'Respond with ONLY a JSON object: {"edits":[{"index":N,"newValue":N,"reason":"..."}],"note":"one-line summary"}. ' +
  "No prose outside the JSON.";

function extractJson(text: string): unknown {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b < 0 || b <= a) throw new Error("AI did not return JSON.");
  return JSON.parse(text.slice(a, b + 1));
}

/**
 * Ask the AI which fields to change to accomplish `goal`. Returns validated edits
 * whose indices exist in `fields`. Throws NoKeyError if no API key is set.
 */
export async function planSaveEdits(
  fields: AgentField[],
  goal: string
): Promise<{ edits: AgentEdit[]; note: string }> {
  // Compact table keeps token use reasonable even for large saves.
  const table = fields
    .map((f) => `${f.index}\t${f.label}\t${f.kind}\t${f.value}\t${f.category}`)
    .join("\n");
  const user =
    `GOAL: ${goal}\n\nFIELDS (index, label, type, value, category):\n` + table;

  const raw = await askAI(AGENT_SYSTEM, user);
  const parsed = extractJson(raw) as { edits?: AgentEdit[]; note?: string };
  const valid = new Set(fields.map((f) => f.index));
  const edits = (parsed.edits ?? []).filter(
    (e) => valid.has(e.index) && Number.isFinite(e.newValue)
  );
  return { edits, note: parsed.note ?? "" };
}
