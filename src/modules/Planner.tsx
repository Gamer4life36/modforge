import { useEffect, useMemo, useState } from "react";
import { loadJSON, saveJSON, uid } from "../lib/store";
import { askAI, NoKeyError } from "../lib/ai";

interface Part {
  id: string;
  name: string;
  cost: number;
  value: number;
}
interface Build {
  id: string;
  name: string;
  budget: number;
  parts: Part[];
}

const KEY = "modforge.builds";
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const PLANNER_SYSTEM =
  "You are a build/loadout optimizer for games. Given a build (a budget and a list of " +
  "parts with cost and value), assess whether it's efficient, flag weak/overpriced " +
  "picks, and suggest concrete swaps to raise total value within budget. Be concise.";

function freshBuild(): Build {
  return { id: uid(), name: "New build", budget: 100, parts: [] };
}

export default function Planner({ setStatus }: { setStatus: (s: string) => void }) {
  const [builds, setBuilds] = useState<Build[]>(() => {
    const b = loadJSON<Build[]>(KEY, []);
    return b.length ? b : [freshBuild()];
  });
  const [activeId, setActiveId] = useState<string>(() => "");
  const [aiOut, setAiOut] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  // keep an always-valid active build
  const active = builds.find((b) => b.id === activeId) ?? builds[0];
  useEffect(() => {
    if (active && active.id !== activeId) setActiveId(active.id);
  }, [active, activeId]);

  useEffect(() => saveJSON(KEY, builds), [builds]);

  function patchActive(patch: Partial<Build>) {
    setBuilds((bs) => bs.map((b) => (b.id === active.id ? { ...b, ...patch } : b)));
  }
  function patchPart(pid: string, patch: Partial<Part>) {
    patchActive({ parts: active.parts.map((p) => (p.id === pid ? { ...p, ...patch } : p)) });
  }
  function addPart() {
    patchActive({ parts: [...active.parts, { id: uid(), name: "", cost: 0, value: 0 }] });
  }
  function removePart(pid: string) {
    patchActive({ parts: active.parts.filter((p) => p.id !== pid) });
  }
  function newBuild() {
    const b = freshBuild();
    setBuilds((bs) => [...bs, b]);
    setActiveId(b.id);
  }
  function deleteBuild() {
    setBuilds((bs) => {
      const rest = bs.filter((b) => b.id !== active.id);
      const next = rest.length ? rest : [freshBuild()];
      setActiveId(next[0].id);
      return next;
    });
  }

  const totals = useMemo(() => {
    const cost = active.parts.reduce((s, p) => s + (Number(p.cost) || 0), 0);
    const value = active.parts.reduce((s, p) => s + (Number(p.value) || 0), 0);
    return { cost, value, over: cost > active.budget, eff: cost > 0 ? value / cost : 0 };
  }, [active]);

  async function review() {
    setAiBusy(true);
    setAiOut("");
    try {
      const spec =
        `Build: ${active.name}\nBudget: ${active.budget}\nParts:\n` +
        active.parts.map((p) => `- ${p.name || "(unnamed)"}: cost ${p.cost}, value ${p.value}`).join("\n") +
        `\nTotal cost ${totals.cost}, total value ${totals.value}`;
      setAiOut(await askAI(PLANNER_SYSTEM, spec));
      setStatus("Build reviewed by AI.");
    } catch (e) {
      if (e instanceof NoKeyError) setStatus("Set your Anthropic key in the Editor tab first.");
      else setAiOut("Error: " + msg(e));
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div className="module-planner">
      <div className="subbar">
        <select value={active.id} onChange={(e) => setActiveId(e.target.value)}>
          {builds.map((b) => <option key={b.id} value={b.id}>{b.name || "(unnamed)"}</option>)}
        </select>
        <button className="btn" onClick={newBuild}>New build</button>
        <button className="btn" onClick={deleteBuild}>Delete</button>
        <div className="spacer" />
        <button className="btn primary" onClick={review} disabled={aiBusy || active.parts.length === 0}>
          {aiBusy ? "Reviewing…" : "AI review build"}
        </button>
      </div>

      <div className="planner-body">
        <div className="planner-head">
          <label>Build name
            <input value={active.name} onChange={(e) => patchActive({ name: e.target.value })} />
          </label>
          <label>Budget
            <input type="number" value={active.budget}
              onChange={(e) => patchActive({ budget: Number(e.target.value) || 0 })} />
          </label>
        </div>

        <div className="tablewrap">
          <table className="fields">
            <thead>
              <tr><th>Part</th><th>Cost</th><th>Value</th><th>Efficiency</th><th></th></tr>
            </thead>
            <tbody>
              {active.parts.map((p) => (
                <tr key={p.id}>
                  <td><input className="valinput" value={p.name} placeholder="part name"
                    onChange={(e) => patchPart(p.id, { name: e.target.value })} /></td>
                  <td><input className="valinput" type="number" value={p.cost}
                    onChange={(e) => patchPart(p.id, { cost: Number(e.target.value) || 0 })} /></td>
                  <td><input className="valinput" type="number" value={p.value}
                    onChange={(e) => patchPart(p.id, { value: Number(e.target.value) || 0 })} /></td>
                  <td className="type">{p.cost > 0 ? (p.value / p.cost).toFixed(2) : "—"}</td>
                  <td className="rowops">
                    <button className="iconbtn danger" onClick={() => removePart(p.id)} title="Remove">✕</button>
                  </td>
                </tr>
              ))}
              {active.parts.length === 0 && (
                <tr><td colSpan={5} className="hint" style={{ padding: 16 }}>No parts yet — add one below.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <button className="btn" onClick={addPart}>+ Add part</button>

        <div className={`planner-totals ${totals.over ? "over" : ""}`}>
          <span>Cost <b>{totals.cost}</b> / {active.budget}{totals.over ? " ⚠ over budget" : ""}</span>
          <span>Value <b>{totals.value}</b></span>
          <span>Efficiency <b>{totals.eff.toFixed(2)}</b></span>
          <span>Remaining <b>{active.budget - totals.cost}</b></span>
        </div>

        {aiOut && <div className="ai-output"><pre>{aiOut}</pre></div>}
      </div>
    </div>
  );
}
