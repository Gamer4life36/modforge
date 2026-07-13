import { useMemo, useState } from "react";
import { pickFile, sqliteTables, sqliteTable, sqliteSet, type SqlTable } from "../lib/tauri-io";

const basename = (p: string) => p.replace(/\\/g, "/").split("/").pop() ?? p;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function Database({ setStatus }: { setStatus: (s: string) => void }) {
  const [path, setPath] = useState<string | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [active, setActive] = useState<string>("");
  const [data, setData] = useState<SqlTable | null>(null);
  const [filter, setFilter] = useState("");

  async function open() {
    try {
      const p = await pickFile();
      if (!p) return;
      const t = await sqliteTables(p);
      setPath(p);
      setTables(t);
      setActive("");
      setData(null);
      setStatus(`Opened ${basename(p)} — ${t.length} table(s)`);
      if (t.length) await loadTable(p, t[0]);
    } catch (e) {
      setStatus("Not a SQLite database (or open failed): " + msg(e));
    }
  }

  async function loadTable(p: string, table: string) {
    try {
      const d = await sqliteTable(p, table);
      setActive(table);
      setData(d);
      setStatus(`Table "${table}" — ${d.rows.length} row(s), ${d.columns.length} column(s)`);
    } catch (e) {
      setStatus("Load table failed: " + msg(e));
    }
  }

  async function saveCell(rowIndex: number, colIndex: number, value: string) {
    if (!path || !data) return;
    const rowid = data.rowids[rowIndex];
    const column = data.columns[colIndex];
    // optimistic local update
    const next = { ...data, rows: data.rows.map((r) => [...r]) };
    next.rows[rowIndex][colIndex] = value;
    setData(next);
    try {
      const backup = await sqliteSet(path, active, rowid, column, value);
      setStatus(`Saved ${column}=${value} (row ${rowid}) · backup: ${basename(backup)}`);
    } catch (e) {
      setStatus("Save failed: " + msg(e));
    }
  }

  const visibleRows = useMemo(() => {
    if (!data) return [];
    const f = filter.trim().toLowerCase();
    const idx = data.rows.map((_, i) => i);
    if (!f) return idx;
    return idx.filter((i) => data.rows[i].some((c) => c.toLowerCase().includes(f)));
  }, [data, filter]);

  return (
    <div className="module-db">
      <div className="subbar">
        <button className="btn" onClick={open}>Open .sqlite / .db…</button>
        {tables.length > 0 && (
          <select value={active} onChange={(e) => path && loadTable(path, e.target.value)}>
            {tables.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {path && <span className="fname" title={path}>{basename(path)}</span>}
        <div className="spacer" />
        {data && (
          <input className="filter" style={{ width: 220 }} placeholder="Filter rows…"
            value={filter} onChange={(e) => setFilter(e.target.value)} />
        )}
      </div>

      <div className="db-body">
        {!path && (
          <div className="empty">
            <p>Open a SQLite game save to browse and edit its tables.</p>
            <button className="btn primary" onClick={open}>Open a database</button>
            <p className="hint">Common in Unity/Android games. Every edit makes a backup first.</p>
          </div>
        )}

        {data && (
          <div className="tablewrap">
            <table className="fields">
              <thead>
                <tr>
                  <th>rowid</th>
                  {data.columns.map((c) => <th key={c}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((ri) => (
                  <tr key={data.rowids[ri]}>
                    <td className="type">{data.rowids[ri]}</td>
                    {data.rows[ri].map((cell, ci) => (
                      <td key={ci}>
                        <input
                          className="valinput"
                          defaultValue={cell}
                          onBlur={(e) => {
                            if (e.target.value !== cell) saveCell(ri, ci, e.target.value);
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr><td colSpan={data.columns.length + 1} className="hint" style={{ padding: 16 }}>No rows.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
