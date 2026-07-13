use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Result of reading a file: decoded text (or a hex preview for binaries) + metadata.
#[derive(serde::Serialize)]
struct ReadResult {
    text: String,
    is_binary: bool,
    size: u64,
    path: String,
}

/// Heuristic: a file is "binary" if it has NUL bytes or a high ratio of
/// non-text control bytes in the first 8 KB.
fn looks_binary(bytes: &[u8]) -> bool {
    let n = bytes.len().min(8192);
    if n == 0 {
        return false;
    }
    let slice = &bytes[..n];
    if slice.contains(&0u8) {
        return true;
    }
    let nonprintable = slice
        .iter()
        .filter(|&&b| b < 0x09 || (b > 0x0d && b < 0x20))
        .count();
    (nonprintable as f64 / n as f64) > 0.30
}

/// A classic offset / hex / ascii dump of the first 4 KB (for read-only binary view).
fn hex_preview(bytes: &[u8]) -> String {
    let n = bytes.len().min(4096);
    let mut out = String::new();
    for (i, chunk) in bytes[..n].chunks(16).enumerate() {
        let hex: Vec<String> = chunk.iter().map(|b| format!("{:02x}", b)).collect();
        let ascii: String = chunk
            .iter()
            .map(|&b| if (0x20..0x7f).contains(&b) { b as char } else { '.' })
            .collect();
        out.push_str(&format!(
            "{:08x}  {:<47}  {}\n",
            i * 16,
            hex.join(" "),
            ascii
        ));
    }
    if bytes.len() > n {
        out.push_str(&format!("... ({} more bytes)\n", bytes.len() - n));
    }
    out
}

fn timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Read any file the user picks. Full FS access lives in Rust so we can touch
/// arbitrary game files without wrestling the JS fs-scope allowlist.
#[tauri::command]
fn read_file(path: String) -> Result<ReadResult, String> {
    let bytes = fs::read(&path).map_err(|e| format!("read failed: {e}"))?;
    let size = bytes.len() as u64;
    let is_binary = looks_binary(&bytes);
    let text = if is_binary {
        hex_preview(&bytes)
    } else {
        String::from_utf8_lossy(&bytes).into_owned()
    };
    Ok(ReadResult {
        text,
        is_binary,
        size,
        path,
    })
}

/// Write text back to a file. When `make_backup` is set (the default in the UI),
/// the original is copied to `<path>.modforge-bak-<unixtime>` FIRST — the safety
/// net every modder wishes they had. Returns the backup path if one was made.
#[tauri::command]
fn write_file(path: String, contents: String, make_backup: bool) -> Result<Option<String>, String> {
    let mut backup_path: Option<String> = None;
    if make_backup && Path::new(&path).exists() {
        let bp = format!("{}.modforge-bak-{}", path, timestamp());
        fs::copy(&path, &bp).map_err(|e| format!("backup failed: {e}"))?;
        backup_path = Some(bp);
    }
    fs::write(&path, contents).map_err(|e| format!("write failed: {e}"))?;
    Ok(backup_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![read_file, write_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
