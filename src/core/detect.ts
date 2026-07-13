// Format detection: decide how to parse a file from its extension + a content sniff.

export type Format =
  | "json"
  | "ini"
  | "toml"
  | "yaml"
  | "xml"
  | "csv"
  | "text"
  | "binary";

const BY_EXT: Record<string, Format> = {
  json: "json",
  json5: "json",
  ini: "ini",
  cfg: "ini",
  conf: "ini",
  config: "ini",
  properties: "ini",
  toml: "toml",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  csv: "csv",
  tsv: "csv",
  txt: "text",
  log: "text",
  md: "text",
};

export function extensionOf(path: string): string {
  const base = path.replace(/\\/g, "/").split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/** Choose a format. `isBinary` comes from the Rust reader's byte heuristic. */
export function detectFormat(path: string, text: string, isBinary: boolean): Format {
  if (isBinary) return "binary";

  const ext = extensionOf(path);
  if (BY_EXT[ext]) return BY_EXT[ext];

  const t = text.trim();
  if (!t) return "text";

  // JSON: strict parse decides it
  if ((t[0] === "{" || t[0] === "[") && (t.endsWith("}") || t.endsWith("]"))) {
    try {
      JSON.parse(t);
      return "json";
    } catch {
      /* fall through */
    }
  }
  if (t[0] === "<") return "xml";

  const hasSection = /^\s*\[[^\]\n]+\]\s*$/m.test(t);
  const hasKeyEq = /^\s*[\w.$-]+\s*=/m.test(t);
  if (hasSection && hasKeyEq) return "toml"; // both quoted values + sections → lean toml
  if (hasKeyEq) return "ini";
  if (/^\s*[\w.$-]+\s*:\s/m.test(t)) return "yaml";

  return "text";
}

export function isStructured(format: Format): boolean {
  return (
    format === "json" ||
    format === "ini" ||
    format === "toml" ||
    format === "yaml" ||
    format === "xml" ||
    format === "csv"
  );
}
