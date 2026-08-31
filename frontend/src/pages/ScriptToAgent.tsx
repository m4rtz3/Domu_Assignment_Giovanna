import { useRef, useState } from "react";
import { apiPost, apiPostFile, ApiError } from "../api";
import { downloadMarkdown, downloadPdf, downloadText, stripMarkdown } from "../download";

interface CallFlowBranch {
  condition: string;
  response: string;
}

interface CallFlowStep {
  step: string;
  purpose: string;
  example_line: string;
  branches: CallFlowBranch[];
}

interface ScriptToAgentResponse {
  client_name: string;
  call_flow: CallFlowStep[];
  agent_system_prompt: string;
  degraded: boolean;
  mock: boolean;
}

const EXAMPLE_SCRIPT = `Hey there, this is [Agent] calling from [Client] about your account.
We noticed your payment is a bit overdue. Can we go ahead and take care of that today?
If they say they can't pay, ask if a payment plan next week would work instead.
Always confirm they're the right person before talking about the account.`;

const EMPTY_STEP: CallFlowStep = { step: "", purpose: "", example_line: "", branches: [] };

export default function ScriptToAgent() {
  const [clientName, setClientName] = useState("Meridian Bank");
  const [rawScript, setRawScript] = useState(EXAMPLE_SCRIPT);
  const [result, setResult] = useState<ScriptToAgentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // What's actually shown/edited after a generation -- starts as a copy of the
  // generated result, but from then on is entirely yours: edit any field, add or
  // remove steps and branches, rewrite the prompt. Re-generating replaces it.
  const [editableFlow, setEditableFlow] = useState<CallFlowStep[]>([]);
  const [editablePrompt, setEditablePrompt] = useState("");

  async function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setTranscribing(true);
    setTranscribeError(null);
    try {
      const { transcript } = await apiPostFile<{ transcript: string }>("/api/transcribe", file);
      setRawScript(transcript);
    } catch (err) {
      setTranscribeError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setTranscribing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function submit() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await apiPost<ScriptToAgentResponse>("/api/script-to-agent", {
        client_name: clientName,
        raw_script: rawScript,
      });
      setResult(response);
      setEditableFlow(response.call_flow);
      setEditablePrompt(response.agent_system_prompt);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function updateStep(index: number, field: keyof Omit<CallFlowStep, "branches">, value: string) {
    setEditableFlow((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  function removeStep(index: number) {
    setEditableFlow((prev) => prev.filter((_, i) => i !== index));
  }

  function addStep() {
    setEditableFlow((prev) => [...prev, { ...EMPTY_STEP }]);
  }

  function updateBranch(stepIndex: number, branchIndex: number, field: keyof CallFlowBranch, value: string) {
    setEditableFlow((prev) =>
      prev.map((s, i) =>
        i !== stepIndex
          ? s
          : { ...s, branches: s.branches.map((b, j) => (j === branchIndex ? { ...b, [field]: value } : b)) }
      )
    );
  }

  function removeBranch(stepIndex: number, branchIndex: number) {
    setEditableFlow((prev) =>
      prev.map((s, i) => (i !== stepIndex ? s : { ...s, branches: s.branches.filter((_, j) => j !== branchIndex) }))
    );
  }

  function addBranch(stepIndex: number) {
    setEditableFlow((prev) =>
      prev.map((s, i) => (i !== stepIndex ? s : { ...s, branches: [...s.branches, { condition: "", response: "" }] }))
    );
  }

  function buildMarkdown(): string {
    const lines = [`# ${clientName || "Voice Agent"} — Call Flow & Agent Prompt`, ""];

    editableFlow.forEach((step, i) => {
      lines.push(`## ${i + 1}. ${step.step || "(untitled step)"}`);
      lines.push("");
      lines.push(`**Purpose:** ${step.purpose}`);
      lines.push("");
      lines.push(`**Example line:** "${step.example_line}"`);
      if (step.branches.length > 0) {
        lines.push("");
        lines.push("**Branches:**");
        step.branches.forEach((b) => lines.push(`- If *${b.condition}* → ${b.response}`));
      }
      lines.push("");
    });

    lines.push("## Agent system prompt", "", "```", editablePrompt, "```", "");
    return lines.join("\n");
  }

  function baseFilename(): string {
    return (clientName || "agent").replace(/\s+/g, "-").toLowerCase() + "-call-flow";
  }

  function handleDownloadMarkdown() {
    downloadMarkdown(`${baseFilename()}.md`, buildMarkdown());
  }

  function handleDownloadText() {
    downloadText(`${baseFilename()}.txt`, buildMarkdown());
  }

  function handleDownloadPdf() {
    downloadPdf(`${baseFilename()}.pdf`, `${clientName || "Voice Agent"} — Call Flow & Agent Prompt`, stripMarkdown(buildMarkdown()));
  }

  return (
    <div className="panel">
      <h2>Script → Structured agent</h2>
      <p className="loading">
        Paste a client's raw call script — or upload an actual call recording and let it get
        transcribed automatically. An LLM turns it into a structured call flow plus a
        ready-to-use system prompt for a voice agent, including the compliance disclosures a
        collections call requires.
      </p>

      <label htmlFor="client-name">Client name</label>
      <input id="client-name" type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} />

      <label htmlFor="raw-script">Raw call script</label>
      <textarea id="raw-script" value={rawScript} onChange={(e) => setRawScript(e.target.value)} />

      <label htmlFor="audio-upload">Or upload a call recording to transcribe it into the field above</label>
      <div className="file-input-row">
        <input
          id="audio-upload"
          type="file"
          accept="audio/*"
          ref={fileInputRef}
          onChange={handleAudioUpload}
          disabled={transcribing}
        />
      </div>
      {transcribing && (
        <div className="loading-row">
          <span className="spinner" />
          Transcribing locally, this can take up to a minute for longer calls...
        </div>
      )}
      {transcribeError && <div className="error-box">{transcribeError}</div>}

      <button className="primary" onClick={submit} disabled={loading || !rawScript.trim()}>
        {loading ? "Generating..." : "Generate agent"}
      </button>

      {error && <div className="error-box">{error}</div>}

      {result && (
        <div style={{ marginTop: 20 }}>
          {result.degraded && (
            <div className="degraded-box">
              AI generation was unavailable, so this is a generic fallback template, not tailored
              to the script you pasted. Try again shortly.
            </div>
          )}
          {result.mock && (
            <div className="mock-box">
              LLM_MOCK_MODE is on — this is canned demo data, not a real LLM generation.
            </div>
          )}
          <p className="flow-step-meta">
            Everything below is yours to edit — change any field, add or remove steps and
            branches, rewrite the prompt.
          </p>

          <h3>Call flow</h3>
          {editableFlow.map((step, i) => (
            <div className="flow-step" key={i}>
              <div className="button-row" style={{ justifyContent: "space-between" }}>
                <span className="flow-step-meta">Step {i + 1}</span>
                <button className="secondary" onClick={() => removeStep(i)}>
                  Remove step
                </button>
              </div>
              <label>Step name</label>
              <input type="text" value={step.step} onChange={(e) => updateStep(i, "step", e.target.value)} />
              <label>Purpose</label>
              <input type="text" value={step.purpose} onChange={(e) => updateStep(i, "purpose", e.target.value)} />
              <label>Example line</label>
              <input
                type="text"
                value={step.example_line}
                onChange={(e) => updateStep(i, "example_line", e.target.value)}
              />

              {step.branches.length > 0 && (
                <div className="branch-list">
                  {step.branches.map((branch, j) => (
                    <div key={j} style={{ marginBottom: 10 }}>
                      <label>If (condition)</label>
                      <input
                        type="text"
                        value={branch.condition}
                        onChange={(e) => updateBranch(i, j, "condition", e.target.value)}
                      />
                      <label>Then (agent response)</label>
                      <input
                        type="text"
                        value={branch.response}
                        onChange={(e) => updateBranch(i, j, "response", e.target.value)}
                      />
                      <button className="secondary" style={{ marginTop: 6 }} onClick={() => removeBranch(i, j)}>
                        Remove branch
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button className="secondary" style={{ marginTop: 8 }} onClick={() => addBranch(i)}>
                + Add branch
              </button>
            </div>
          ))}
          <button className="secondary" onClick={addStep}>
            + Add step
          </button>

          <h3>Generated agent system prompt</h3>
          <textarea
            value={editablePrompt}
            onChange={(e) => setEditablePrompt(e.target.value)}
            style={{ minHeight: 200 }}
          />

          <div className="button-row" style={{ marginTop: 12 }}>
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
      )}
    </div>
  );
}
