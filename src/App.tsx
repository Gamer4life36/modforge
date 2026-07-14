import { useState } from "react";
import Editor from "./modules/Editor";
import Converter from "./modules/Converter";
import LogExplainer from "./modules/LogExplainer";
import Planner from "./modules/Planner";
import Tracker from "./modules/Tracker";
import Database from "./modules/Database";
import Device from "./modules/Device";
import Trainer from "./modules/Trainer";
import Agent from "./modules/Agent";
import "./App.css";

type Tab =
  | "editor"
  | "trainer"
  | "agent"
  | "converter"
  | "logs"
  | "planner"
  | "tracker"
  | "database"
  | "device";

export default function App() {
  const [tab, setTab] = useState<Tab>("editor");
  const [status, setStatus] = useState("ModForge ready — open a file to begin.");
  const [pendingOpen, setPendingOpen] = useState<{ path: string; nonce: number } | undefined>(undefined);

  // Pulled device saves route to the Agent — it handles binary (.NET/NRBF) saves
  // like Murder Hill that the Trainer can't parse.
  function openInAgent(path: string) {
    setPendingOpen({ path, nonce: Date.now() });
    setTab("agent");
  }

  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand">
          <span className="logo">⚒</span> ModForge
          <span className="tag">AI Mod &amp; Asset Toolkit</span>
        </div>
        <nav className="tabs">
          <button
            className={`tab ${tab === "editor" ? "active" : ""}`}
            onClick={() => setTab("editor")}
          >
            Editor
          </button>
          <button
            className={`tab ${tab === "trainer" ? "active" : ""}`}
            onClick={() => setTab("trainer")}
          >
            Trainer
          </button>
          <button
            className={`tab ${tab === "agent" ? "active" : ""}`}
            onClick={() => setTab("agent")}
          >
            AI Agent
          </button>
          <button
            className={`tab ${tab === "converter" ? "active" : ""}`}
            onClick={() => setTab("converter")}
          >
            Converter
          </button>
          <button
            className={`tab ${tab === "logs" ? "active" : ""}`}
            onClick={() => setTab("logs")}
          >
            Log Explainer
          </button>
          <button
            className={`tab ${tab === "planner" ? "active" : ""}`}
            onClick={() => setTab("planner")}
          >
            Planner
          </button>
          <button
            className={`tab ${tab === "tracker" ? "active" : ""}`}
            onClick={() => setTab("tracker")}
          >
            Tracker
          </button>
          <button
            className={`tab ${tab === "database" ? "active" : ""}`}
            onClick={() => setTab("database")}
          >
            Database
          </button>
          <button
            className={`tab ${tab === "device" ? "active" : ""}`}
            onClick={() => setTab("device")}
          >
            Device
          </button>
        </nav>
        <div className="spacer" />
      </header>

      <div className="module-host">
        {tab === "editor" && <Editor setStatus={setStatus} />}
        {tab === "trainer" && <Trainer setStatus={setStatus} autoOpen={pendingOpen} />}
        {tab === "agent" && <Agent setStatus={setStatus} autoOpen={pendingOpen} />}
        {tab === "converter" && <Converter setStatus={setStatus} />}
        {tab === "logs" && <LogExplainer setStatus={setStatus} />}
        {tab === "planner" && <Planner setStatus={setStatus} />}
        {tab === "tracker" && <Tracker setStatus={setStatus} />}
        {tab === "database" && <Database setStatus={setStatus} />}
        {tab === "device" && <Device setStatus={setStatus} onOpen={openInAgent} />}
      </div>

      <footer className="status">{status}</footer>
    </div>
  );
}
