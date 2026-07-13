import { useState } from "react";
import Editor from "./modules/Editor";
import Converter from "./modules/Converter";
import LogExplainer from "./modules/LogExplainer";
import Planner from "./modules/Planner";
import Tracker from "./modules/Tracker";
import "./App.css";

type Tab = "editor" | "converter" | "logs" | "planner" | "tracker";

export default function App() {
  const [tab, setTab] = useState<Tab>("editor");
  const [status, setStatus] = useState("ModForge ready — open a file to begin.");

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
        </nav>
        <div className="spacer" />
      </header>

      <div className="module-host">
        {tab === "editor" && <Editor setStatus={setStatus} />}
        {tab === "converter" && <Converter setStatus={setStatus} />}
        {tab === "logs" && <LogExplainer setStatus={setStatus} />}
        {tab === "planner" && <Planner setStatus={setStatus} />}
        {tab === "tracker" && <Tracker setStatus={setStatus} />}
      </div>

      <footer className="status">{status}</footer>
    </div>
  );
}
