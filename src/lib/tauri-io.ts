// Thin bridge to the Rust commands + native file dialogs.

import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";

export interface ReadResult {
  text: string;
  is_binary: boolean;
  size: number;
  path: string;
}

/** Native "open file" dialog. Returns the chosen path, or null if cancelled. */
export async function pickFile(): Promise<string | null> {
  const res = await openDialog({
    multiple: false,
    directory: false,
    filters: [
      {
        name: "Config / data / save files",
        extensions: [
          "json", "ini", "cfg", "conf", "config", "properties",
          "toml", "yaml", "yml", "xml", "csv", "tsv", "txt", "save", "dat", "sav",
        ],
      },
      { name: "All files", extensions: ["*"] },
    ],
  });
  return typeof res === "string" ? res : null;
}

/** Native "save as" dialog. Returns the chosen path, or null if cancelled. */
export async function pickSavePath(defaultName?: string): Promise<string | null> {
  const res = await saveDialog({ defaultPath: defaultName });
  return typeof res === "string" ? res : null;
}

export function readFile(path: string): Promise<ReadResult> {
  return invoke<ReadResult>("read_file", { path });
}

/** Read a file as raw bytes (for binary saves the AI Save Agent parses). */
export async function readBytes(path: string): Promise<Uint8Array> {
  const arr = await invoke<number[]>("read_bytes", { path });
  return Uint8Array.from(arr);
}

/** Write raw bytes back. Returns the backup path created, or null. */
export function writeBytes(
  path: string,
  bytes: Uint8Array,
  makeBackup: boolean
): Promise<string | null> {
  return invoke<string | null>("write_bytes", { path, bytes: Array.from(bytes), makeBackup });
}

/** Returns the backup path that was created (or null if backups were off). */
export function writeFile(
  path: string,
  contents: string,
  makeBackup: boolean
): Promise<string | null> {
  return invoke<string | null>("write_file", { path, contents, makeBackup });
}

// ---- SQLite (game saves stored as .sqlite/.db) ----

export interface SqlTable {
  columns: string[];
  rows: string[][];
  rowids: number[];
}

export function sqliteTables(path: string): Promise<string[]> {
  return invoke<string[]>("sqlite_tables", { path });
}
export function sqliteTable(path: string, table: string): Promise<SqlTable> {
  return invoke<SqlTable>("sqlite_table", { path, table });
}
/** Update one cell; returns the backup path created before writing. */
export function sqliteSet(
  path: string,
  table: string,
  rowid: number,
  column: string,
  value: string
): Promise<string> {
  return invoke<string>("sqlite_set", { path, table, rowid, column, value });
}

// ---- ADB passthrough ----
export function adbRun(args: string[]): Promise<string> {
  return invoke<string>("adb_run", { args });
}

/** A writable temp path to stage a pulled save file before opening it. */
export function tempPath(name: string): Promise<string> {
  return invoke<string>("temp_path", { name });
}
