// Parse / serialize the structured text formats. Each format round-trips through
// a plain JS object so the rest of the app only deals with one shape.

import { parse as parseIni, stringify as stringifyIni } from "ini";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import YAML from "yaml";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import type { Format } from "./detect";

export interface ParseResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

const XML_OPTS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
} as const;

const xmlParser = new XMLParser(XML_OPTS);
const xmlBuilder = new XMLBuilder({ ...XML_OPTS, format: true, indentBy: "  " });

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function stringifyCsv(data: unknown): string {
  if (!Array.isArray(data) || data.length === 0) return "";
  const headers = Object.keys(data[0] as object);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = (data as Record<string, unknown>[]).map((r) =>
    headers.map((h) => esc(r[h])).join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

export function parseContent(format: Format, text: string): ParseResult {
  try {
    switch (format) {
      case "json":
        return { ok: true, data: JSON.parse(text) };
      case "ini":
        return { ok: true, data: parseIni(text) };
      case "toml":
        return { ok: true, data: parseToml(text) };
      case "yaml":
        return { ok: true, data: YAML.parse(text) ?? {} };
      case "xml":
        return { ok: true, data: xmlParser.parse(text) };
      case "csv":
        return { ok: true, data: parseCsv(text) };
      default:
        return { ok: false, error: `no structured parser for '${format}'` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function stringifyContent(format: Format, data: unknown, original: string): string {
  switch (format) {
    case "json":
      return JSON.stringify(data, null, 2) + "\n";
    case "ini":
      return stringifyIni(data as Record<string, unknown>);
    case "toml":
      return stringifyToml(data as Record<string, unknown>);
    case "yaml":
      return YAML.stringify(data);
    case "xml":
      return xmlBuilder.build(data);
    case "csv":
      return stringifyCsv(data);
    default:
      return original;
  }
}
