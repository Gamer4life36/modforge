import { useEffect, useMemo, useState } from "react";
import { loadJSON, saveJSON, uid } from "../lib/store";
import { askAI, NoKeyError } from "../lib/ai";

interface Entry {
  id: string;
  date: number; // ms epoch
  category: string;
  value: number;
  note: string;
}

const KEY = "modforge.entries";
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const TRACKER_SYSTEM =
  "You are a concise progress coach. Given a log of dated entries (category, value, " +
  "note), summarize trends, note streaks or slumps, and give one actionable suggestion. " +
  "Keep it short and encouraging.";

const dayKey = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export default function Tracker({ setStatus }: { setStatus: (s: string) => void }) {
  const [entries, setEntries] = useState<Entry[]>(() => loadJSON<Entry[]>(KEY, []));
  const [category, setCategory] = useState("");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("all");
  const [aiOut, setAiOut] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => saveJSON(KEY, entries), [entries]);

  const categories = useMemo(
    () => Array.from(new Set(entries.map((e) => e.category).filter(Boolean))).sort(),
    [entries]
  );

  const shown = useMemo(() => {
    const list = filter === "all" ? entries : entries.filter((e) => e.category === filter);
    return [...list].sort((a, b) => b.date - a.date);
  }, [entries, filter]);

  const stats = useMemo(() => {
    const list = filter === "all" ? entries : entries.filter((e) => e.category === filter);
    const total = list.reduce((s, e) => s + (Number(e.value) || 0), 0);
    const best = list.reduce((m, e) => Math.max(m, Number(e.value) || 0), 0);
    // day streak ending today
    const days = new Set(list.map((e) => dayKey(e.date)));
    let streak = 0;
    let cur = dayKey(Date.now());
    while (days.has(cur)) {
      streak++;
      cur -= 86400000;
    }
    return { count: list.length, total, best, streak };
  }, [entries, filter]);

  function addEntry() {
    const v = Number(value);
    if (!category.trim() || Number.isNaN(v)) {
      setStatus("Enter a category and a numeric value.");
      return;
    }
    setEntries((es) => [
      ...es,
      { id: uid(), date: Date.now(), category: category.trim(), value: v, note: note.trim() },
    ]);
    setValue("");
    setNote("");
    setStatus(`Logged ${v} to ${category.trim()}.`);
  }

  function remove(id: string) {
    setEntries((es) => es.filter((e) => e.id !== id));
  }

  async function analyze() {
    if (entries.length === 0) return;
    setAiBusy(true);
    setAiOut("");
    try {
      const list = filter === "all" ? entries : entries.filter((e) => e.category === filter);
      const recent = [...list].sort((a, b) => b.date - a.date).slice(0, 40);
      const spec = recent
        .map((e) => `${new Date(e.date).toLocaleDateString()} | ${e.category} | ${e.value}${e.note ? " | " + e.note : ""}`)
        .join("\n");
      setAiOut(await askAI(TRACKER_SYSTEM, `Analyze my progress log:\n\n${spec}`));
      setStatus("Progress analyzed.");
    } catch (e) {
      if (e instanceof NoKeyError) setStatus("Set your Anthropic key in the Editor tab first.");
      else setAiOut("Error: " + msg(e));
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div className="module-tracker">
      <div className="subbar">
        <label className="check">Category
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">all</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <div className="spacer" />
        <button className="btn primary" onClick={analyze} disabled={aiBusy || entries.length === 0}>
          {aiBusy ? "Analyzing…" : "AI analyze"}
        </button>
      </div>

      <div className="tracker-body">
        <div className="stat-row">
          <div className="stat"><span>Entries</span><b>{stats.count}</b></div>
          <div className="stat"><span>Total</span><b>{stats.total}</b></div>
          <div className="stat"><span>Best</span><b>{stats.best}</b></div>
          <div className="stat"><span>Day streak</span><b>{stats.streak}🔥</b></div>
        </div>

        <div className="tracker-add">
          <input placeholder="category (e.g. Runs)" value={category} onChange={(e) => setCategory(e.target.value)} list="cats" />
          <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          <input placeholder="value" type="number" value={value} onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addEntry()} />
          <input placeholder="note (optional)" value={note} onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addEntry()} />
          <button className="btn primary" onClick={addEntry}>Log</button>
        </div>

        <div className="tablewrap">
          <table className="fields">
            <thead><tr><th>Date</th><th>Category</th><th>Value</th><th>Note</th><th></th></tr></thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id}>
                  <td className="type">{new Date(e.date).toLocaleDateString()}</td>
                  <td>{e.category}</td>
                  <td>{e.value}</td>
                  <td className="path" title={e.note}>{e.note}</td>
                  <td className="rowops"><button className="iconbtn danger" onClick={() => remove(e.id)} title="Delete">✕</button></td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={5} className="hint" style={{ padding: 16 }}>No entries yet — log your first above.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {aiOut && <div className="ai-output"><pre>{aiOut}</pre></div>}
      </div>
    </div>
  );
}
