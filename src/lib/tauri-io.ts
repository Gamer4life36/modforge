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

/** Returns the backup path that was created (or null if backups were off). */
export function writeFile(
  path: string,
  contents: string,
  makeBackup: boolean
): Promise<string | null> {
  return invoke<string | null>("write_file", { path, contents, makeBackup });
}
