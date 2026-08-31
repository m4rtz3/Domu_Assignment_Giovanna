import { useState } from "react";
import { apiPost, ApiError } from "../api";
import { downloadMarkdown, downloadPdf, downloadText } from "../download";

interface EngineeringTicket {
  title: string;
  priority: string;
  client_name: string;
  description: string;
  acceptance_criteria: string[];
  technical_notes: string;
  degraded: boolean;
  mock: boolean;
}

const EXAMPLE_REQUEST =
  "Hey, can you guys also let people pay with Apple Pay? A few customers asked about it " +
  "on calls this week and we're losing them at the payment step.";

export default function TicketGenerator() {
  const [clientName, setClientName] = useState("Coastal Credit Union");
  const [requestText, setRequestText] = useState(EXAMPLE_REQUEST);
  const [additionalDetails, setAdditionalDetails] = useState("");
  const [ticket, setTicket] = useState<EngineeringTicket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tracker, setTracker] = useState("Linear");
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "sent">("idle");

  async function submit() {
    setLoading(true);
    setError(null);
    setTicket(null);
    setCopied(false);
    try {
      const result = await apiPost<EngineeringTicket>("/api/ticket", {
        client_name: clientName,
        request_text: requestText,
        additional_details: additionalDetails,
      });
      setTicket(result);
      setSendStatus("idle");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function simulateSend() {
    setSendStatus("sending");
    setTimeout(() => setSendStatus("sent"), 700);
  }

  function buildPlainText(): string {
    if (!ticket) return "";
    return (
      `${ticket.title} [${ticket.priority}]\n\n${ticket.description}\n\n` +
      `Acceptance criteria:\n${ticket.acceptance_criteria.map((c) => `- ${c}`).join("\n")}\n\n` +
      `Technical notes: ${ticket.technical_notes}`
    );
  }

  function buildMarkdown(): string {
    if (!ticket) return "";
    return (
      `# ${ticket.title}\n\n` +
      `**Client:** ${ticket.client_name}  \n**Priority:** ${ticket.priority}\n\n` +
      `${ticket.description}\n\n` +
      `## Acceptance criteria\n\n${ticket.acceptance_criteria.map((c) => `- ${c}`).join("\n")}\n\n` +
      `## Technical notes\n\n${ticket.technical_notes}\n`
    );
  }

  function ticketFilename(): string {
    return (ticket?.title || "ticket").replace(/\s+/g, "-").toLowerCase();
  }

  function copyTicket() {
    if (!ticket) return;
    navigator.clipboard.writeText(buildPlainText()).then(() => setCopied(true));
  }

  function handleDownloadMarkdown() {
    downloadMarkdown(`${ticketFilename()}.md`, buildMarkdown());
  }

  function handleDownloadText() {
    downloadText(`${ticketFilename()}.txt`, buildPlainText());
  }

  function handleDownloadPdf() {
    if (!ticket) return;
    downloadPdf(`${ticketFilename()}.pdf`, ticket.title, buildPlainText());
  }

  return (
    <div className="panel">
      <h2>Client request → engineering ticket</h2>
      <p className="loading">
        Paste an informal request a client sent (email, call notes). An LLM drafts a structured
        ticket a developer could pick up without needing to loop back to the client first. This
        is a <strong>draft for you to review and edit</strong> — nothing gets filed automatically.
      </p>

      <label htmlFor="ticket-client">Client name</label>
      <input id="ticket-client" type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} />

      <label htmlFor="ticket-request">Client request</label>
      <textarea id="ticket-request" value={requestText} onChange={(e) => setRequestText(e.target.value)} />

      <label htmlFor="ticket-details">Additional details (optional) — anything the client didn't say but you know is relevant</label>
      <textarea
        id="ticket-details"
        placeholder="e.g. this is urgent, only affects customers in Texas, similar to ticket DOMU-142..."
        value={additionalDetails}
        onChange={(e) => setAdditionalDetails(e.target.value)}
      />

      <button className="primary" onClick={submit} disabled={loading || !requestText.trim()}>
        {loading ? "Drafting..." : "Generate ticket"}
      </button>

      {error && <div className="error-box">{error}</div>}

      {ticket && (
        <div style={{ marginTop: 20 }}>
          {ticket.degraded && (
            <div className="degraded-box">
              AI drafting was unavailable — this is a placeholder ticket, needs manual write-up.
            </div>
          )}
          {ticket.mock && (
            <div className="mock-box">
              LLM_MOCK_MODE is on — this is canned demo data, not a real LLM generation.
            </div>
          )}

          <div className="flow-step">
            <div className="flow-step-title">
              {ticket.title} <span className={`badge badge-${ticket.priority === "high" ? "wrong_outcome" : ticket.priority === "medium" ? "incorrect_statement" : "unclear"}`}>{ticket.priority}</span>
            </div>
            <div className="flow-step-meta">Client: {ticket.client_name}</div>
            <p>{ticket.description}</p>
            <strong>Acceptance criteria</strong>
            <ul>
              {ticket.acceptance_criteria.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
            <strong>Technical notes</strong>
            <p className="flow-step-meta">{ticket.technical_notes}</p>
            <div className="button-row" style={{ marginTop: 8 }}>
              <button className="secondary" onClick={copyTicket}>
                {copied ? "Copied!" : "Copy as text"}
              </button>
              <button className="secondary" onClick={handleDownloadMarkdown}>
                Download .md
              </button>
              <button className="secondary" onClick={handleDownloadText}>
                Download .txt
              </button>
              <button className="secondary" onClick={handleDownloadPdf}>
                Download .pdf
              </button>
            </div>
          </div>

          <div className="panel" style={{ marginTop: 12 }}>
            <div className="flow-step-title">Next step: send to your issue tracker</div>
            <p className="flow-step-meta">
              Review the draft above and edit anything that's off, then send it. The tracker
              integration below isn't live yet — clicking "Send" simulates what filing it would
              look like.
            </p>
            <label htmlFor="tracker-select">Tracker</label>
            <select
              id="tracker-select"
              value={tracker}
              onChange={(e) => {
                setTracker(e.target.value);
                setSendStatus("idle");
              }}
            >
              <option>Linear</option>
              <option>Jira</option>
              <option>GitHub Issues</option>
            </select>
            <button
              className="primary"
              style={{ marginLeft: 10 }}
              onClick={simulateSend}
              disabled={sendStatus === "sending"}
            >
              {sendStatus === "sending" ? "Sending..." : `Send to ${tracker}`}
            </button>
            {sendStatus === "sent" && (
              <div className="mock-box" style={{ marginTop: 10 }}>
                Simulated only — in production this would create a real ticket in {tracker} via
                its API and link back to this client's account.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
