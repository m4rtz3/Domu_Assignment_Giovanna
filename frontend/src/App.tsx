import { useState } from "react";
import CallingCompliance from "./pages/CallingCompliance";
import ComplianceInvestigation from "./pages/ComplianceInvestigation";
import Dashboard from "./pages/Dashboard";
import FixObjectionHandling from "./pages/FixObjectionHandling";
import QAReview from "./pages/QAReview";
import ScriptToAgent from "./pages/ScriptToAgent";
import TicketGenerator from "./pages/TicketGenerator";

type Tab = "script" | "dashboard" | "qa" | "objections" | "ticket" | "compliance" | "calling-windows";

const TABS: { id: Tab; label: string }[] = [
  { id: "script", label: "Script → Agent" },
  { id: "dashboard", label: "Outcomes Dashboard" },
  { id: "qa", label: "QA Review" },
  { id: "objections", label: "Fix Objections" },
  { id: "ticket", label: "Ticket Generator" },
  { id: "compliance", label: "Compliance" },
  { id: "calling-windows", label: "Calling Windows" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("script");

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Domu Ops Copilot</h1>
          <p className="subtitle">
            Scripts, outcomes, QA, and compliance for all 7 client accounts — in one place
          </p>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={t.id === tab ? "tab tab-active" : "tab"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="content">
        {tab === "script" && <ScriptToAgent />}
        {tab === "dashboard" && <Dashboard />}
        {tab === "qa" && <QAReview />}
        {tab === "objections" && <FixObjectionHandling />}
        {tab === "ticket" && <TicketGenerator />}
        {tab === "compliance" && <ComplianceInvestigation />}
        {tab === "calling-windows" && <CallingCompliance />}
      </main>

      <footer className="app-footer">Domu Ops Copilot — internal tool for Technical Operations</footer>
    </div>
  );
}
