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

/// Read a file as raw bytes — needed for binary saves (.NET BinaryFormatter,
/// protobuf, custom formats) that the AI Save Agent parses byte-by-byte.
#[tauri::command]
fn read_bytes(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| format!("read failed: {e}"))
}

/// Write raw bytes back (length-preserving edits keep binary saves valid).
/// Makes a timestamped backup first when `make_backup` is set.
#[tauri::command]
fn write_bytes(path: String, bytes: Vec<u8>, make_backup: bool) -> Result<Option<String>, String> {
    let mut backup_path: Option<String> = None;
    if make_backup && Path::new(&path).exists() {
        let bp = format!("{}.modforge-bak-{}", path, timestamp());
        fs::copy(&path, &bp).map_err(|e| format!("backup failed: {e}"))?;
        backup_path = Some(bp);
    }
    fs::write(&path, &bytes).map_err(|e| format!("write failed: {e}"))?;
    Ok(backup_path)
}

/// A backup file we made for a given save, newest first.
#[derive(serde::Serialize)]
struct BackupInfo {
    path: String,
    name: String,
    unixtime: u64,
    size: u64,
}

/// List the `<path>.modforge-bak-<time>` backups next to a file, newest first,
/// so the UI can offer one-click restore instead of manual file renaming.
#[tauri::command]
fn list_backups(path: String) -> Result<Vec<BackupInfo>, String> {
    let target = Path::new(&path);
    let dir = target.parent().unwrap_or_else(|| Path::new("."));
    let fname = target
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("bad path")?;
    let prefix = format!("{}.modforge-bak-", fname);
    let mut out = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if let Some(ts) = name.strip_prefix(&prefix) {
                let unixtime = ts.parse::<u64>().unwrap_or(0);
                let size = e.metadata().map(|m| m.len()).unwrap_or(0);
                out.push(BackupInfo {
                    path: e.path().to_string_lossy().into_owned(),
                    name,
                    unixtime,
                    size,
                });
            }
        }
    }
    out.sort_by(|a, b| b.unixtime.cmp(&a.unixtime));
    Ok(out)
}

/// Restore a backup over its original file. Before overwriting, the CURRENT file is
/// itself backed up first (so a restore is also undoable). Returns that safety copy's path.
#[tauri::command]
fn restore_backup(backup_path: String, target_path: String) -> Result<Option<String>, String> {
    if !Path::new(&backup_path).exists() {
        return Err("backup file no longer exists".into());
    }
    let mut safety: Option<String> = None;
    if Path::new(&target_path).exists() {
        let bp = format!("{}.modforge-bak-{}", target_path, timestamp());
        fs::copy(&target_path, &bp).map_err(|e| format!("pre-restore backup failed: {e}"))?;
        safety = Some(bp);
    }
    fs::copy(&backup_path, &target_path).map_err(|e| format!("restore failed: {e}"))?;
    Ok(safety)
}

// ---- SQLite save editing (many Android/Unity games store saves as SQLite) ----

#[derive(serde::Serialize)]
struct TableData {
    columns: Vec<String>,
    rows: Vec<Vec<String>>,
    rowids: Vec<i64>,
}

#[tauri::command]
fn sqlite_tables(path: String) -> Result<Vec<String>, String> {
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .map_err(|e| e.to_string())?;
    let mapped = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in mapped {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command]
fn sqlite_table(path: String, table: String) -> Result<TableData, String> {
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    let q = format!("SELECT rowid, * FROM \"{}\" LIMIT 1000", table.replace('"', "\"\""));
    let mut stmt = conn.prepare(&q).map_err(|e| e.to_string())?;
    let ncol = stmt.column_count();
    let colnames: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let mut rows = Vec::new();
    let mut rowids = Vec::new();
    let mut qr = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = qr.next().map_err(|e| e.to_string())? {
        let rid: i64 = row.get(0).map_err(|e| e.to_string())?;
        rowids.push(rid);
        let mut vals = Vec::new();
        for i in 1..ncol {
            let v = match row.get_ref(i).map_err(|e| e.to_string())? {
                rusqlite::types::ValueRef::Null => String::new(),
                rusqlite::types::ValueRef::Integer(n) => n.to_string(),
                rusqlite::types::ValueRef::Real(f) => f.to_string(),
                rusqlite::types::ValueRef::Text(t) => String::from_utf8_lossy(t).into_owned(),
                rusqlite::types::ValueRef::Blob(b) => format!("<blob {} bytes>", b.len()),
            };
            vals.push(v);
        }
        rows.push(vals);
    }
    Ok(TableData {
        columns: colnames[1..].to_vec(),
        rows,
        rowids,
    })
}

#[tauri::command]
fn sqlite_set(
    path: String,
    table: String,
    rowid: i64,
    column: String,
    value: String,
) -> Result<String, String> {
    let bp = format!("{}.modforge-bak-{}", path, timestamp());
    fs::copy(&path, &bp).map_err(|e| format!("backup failed: {e}"))?;
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    let sql = format!(
        "UPDATE \"{}\" SET \"{}\" = ?1 WHERE rowid = ?2",
        table.replace('"', "\"\""),
        column.replace('"', "\"\"")
    );
    // Keep numeric columns numeric where possible.
    if let Ok(n) = value.parse::<i64>() {
        conn.execute(&sql, rusqlite::params![n, rowid])
    } else if let Ok(f) = value.parse::<f64>() {
        conn.execute(&sql, rusqlite::params![f, rowid])
    } else {
        conn.execute(&sql, rusqlite::params![value, rowid])
    }
    .map_err(|e| e.to_string())?;
    Ok(bp)
}

/// Run adb with the given args (e.g. ["devices"], ["pull", remote, local]).
/// For rooted devices you can use ["shell", "su", "-c", "..."] to reach
/// protected /data/data/<pkg>/ save files. Returns combined stdout+stderr.
#[tauri::command]
fn adb_run(args: Vec<String>) -> Result<String, String> {
    let output = std::process::Command::new("adb")
        .args(&args)
        .output()
        .map_err(|e| format!("adb not found on PATH or failed to run: {e}"))?;
    let mut s = String::from_utf8_lossy(&output.stdout).into_owned();
    let err = String::from_utf8_lossy(&output.stderr);
    if !err.trim().is_empty() {
        s.push('\n');
        s.push_str(&err);
    }
    if s.trim().is_empty() {
        s = format!("(no output; exit {:?})", output.status.code());
    }
    Ok(s)
}

/// Return a writable temp path (in <temp>/modforge/) for staging a pulled save.
#[tauri::command]
fn temp_path(name: String) -> Result<String, String> {
    let mut dir = std::env::temp_dir();
    dir.push("modforge");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let fname = std::path::Path::new(&name)
        .file_name()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("save.bin");
    dir.push(fname);
    Ok(dir.to_string_lossy().into_owned())
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
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            read_bytes,
            write_bytes,
            list_backups,
            restore_backup,
            sqlite_tables,
            sqlite_table,
            sqlite_set,
            adb_run,
            temp_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
