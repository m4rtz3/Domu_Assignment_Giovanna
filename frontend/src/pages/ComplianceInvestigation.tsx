import { useEffect, useState } from "react";
import { apiGet, apiPost, ApiError } from "../api";

interface ComplianceConcern {
  concern_id: string;
  client_name: string;
  transcript_snippet: string;
  concern_description: string;
}

interface ComplianceResponse {
  risk_flags: string[];
  summary: string;
  recommended_next_steps: string[];
  draft_internal_note: string;
  degraded: boolean;
  mock: boolean;
}

export default function ComplianceInvestigation() {
  const [concerns, setConcerns] = useState<ComplianceConcern[]>([]);
  const [loadingConcerns, setLoadingConcerns] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // draftNotes = whatever's currently in the textarea (pending or being re-edited);
  // savedNotes = committed/saved -- a concern moves to the "Completed" table once this is set.
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [savedNotes, setSavedNotes] = useState<Record<string, string>>({});
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());

  const [aiResults, setAiResults] = useState<Record<string, ComplianceResponse>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [aiError, setAiError] = useState<Record<string, string>>({});

  useEffect(() => {
    loadConcerns();
  }, []);

  async function loadConcerns() {
    setLoadingConcerns(true);
    setListError(null);
    try {
      const data = await apiGet<ComplianceConcern[]>("/api/compliance-investigation/concerns");
      setConcerns(data);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoadingConcerns(false);
    }
  }

  async function getAiDraft(concern: ComplianceConcern) {
    setAiLoading((prev) => ({ ...prev, [concern.concern_id]: true }));
    setAiError((prev) => ({ ...prev, [concern.concern_id]: "" }));
    try {
      const response = await apiPost<ComplianceResponse>("/api/compliance-investigation", {
        client_name: concern.client_name,
        transcript_snippet: concern.transcript_snippet,
        concern_description: concern.concern_description,
      });
      setAiResults((prev) => ({ ...prev, [concern.concern_id]: response }));
    } catch (err) {
      setAiError((prev) => ({
        ...prev,
        [concern.concern_id]: err instanceof ApiError ? err.message : "Something went wrong.",
      }));
    } finally {
      setAiLoading((prev) => ({ ...prev, [concern.concern_id]: false }));
    }
  }

  function updateDraft(concernId: string, value: string) {
    setDraftNotes((prev) => ({ ...prev, [concernId]: value }));
  }

  function useAiDraftAsStartingPoint(concernId: string) {
    const ai = aiResults[concernId];
    if (!ai) return;
    if ((draftNotes[concernId] ?? "").trim() && !window.confirm("Replace what you've written with the AI draft?"))
      return;
    setDraftNotes((prev) => ({ ...prev, [concernId]: ai.draft_internal_note }));
  }

  function saveNotes(concernId: string) {
    setSavedNotes((prev) => ({ ...prev, [concernId]: draftNotes[concernId] ?? "" }));
    setEditingIds((prev) => {
      const next = new Set(prev);
      next.delete(concernId);
      return next;
    });
  }

  function startEditing(concernId: string) {
    setEditingIds((prev) => new Set(prev).add(concernId));
  }

  function cancelEditing(concernId: string) {
    setDraftNotes((prev) => ({ ...prev, [concernId]: savedNotes[concernId] ?? "" }));
    setEditingIds((prev) => {
      const next = new Set(prev);
      next.delete(concernId);
      return next;
    });
  }

  const completed = concerns.filter((c) => savedNotes[c.concern_id] !== undefined);
  const pending = concerns.filter((c) => savedNotes[c.concern_id] === undefined);

  return (
    <div className="panel">
      <h2>Compliance concern investigation</h2>
      <p className="loading">
        Each row below is a concern a client escalated because the agent may have said
        something that violates regulations — this is yours to investigate and write up. Use
        the notes field per concern, and optionally ask for an AI-assisted draft if you want a
        starting point.
      </p>

      <div className="degraded-box">
        No tool here is a lawyer and none give legal advice. Whatever you send to a client,
        customer, or regulator should go through your compliance/legal review first — including
        anything AI-assisted below.
      </div>

      {loadingConcerns && <p className="loading">Loading flagged concerns...</p>}
      {listError && (
        <div className="error-box">
          {listError} <button className="secondary" onClick={loadConcerns}>Retry</button>
        </div>
      )}

      {completed.length > 0 && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="flow-step-title">Completed investigations ({completed.length})</div>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Concern</th>
                  <th>Client</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {completed.map((c) => {
                  const isEditing = editingIds.has(c.concern_id);
                  const draft = draftNotes[c.concern_id] ?? "";
                  return (
                    <tr key={c.concern_id}>
                      <td>{c.concern_id}</td>
                      <td>{c.client_name}</td>
                      <td style={{ maxWidth: isEditing ? "none" : 320 }}>
                        {isEditing ? (
                          <textarea value={draft} onChange={(e) => updateDraft(c.concern_id, e.target.value)} />
                        ) : (
                          <span className="flow-step-meta">{savedNotes[c.concern_id]}</span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <div className="button-row">
                            <button className="primary" onClick={() => saveNotes(c.concern_id)}>
                              Save
                            </button>
                            <button className="secondary" onClick={() => cancelEditing(c.concern_id)}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button className="secondary" onClick={() => startEditing(c.concern_id)}>
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pending.map((concern) => {
        const ai = aiResults[concern.concern_id];
        const loading = aiLoading[concern.concern_id];
        const err = aiError[concern.concern_id];
        const draft = draftNotes[concern.concern_id] ?? "";

        return (
          <div className="flow-step" key={concern.concern_id}>
            <div className="flow-step-title">
              {concern.concern_id} — {concern.client_name}
            </div>
            <div className="flow-step-meta">Concern: {concern.concern_description}</div>
            <div className="flow-step-meta">"{concern.transcript_snippet}"</div>

            <label>Your investigation &amp; response</label>
            <textarea
              placeholder="Write your findings, risk assessment, and next steps here..."
              value={draft}
              onChange={(e) => updateDraft(concern.concern_id, e.target.value)}
            />

            <div className="button-row" style={{ marginTop: 8 }}>
              <button className="primary" onClick={() => saveNotes(concern.concern_id)} disabled={!draft.trim()}>
                Save
              </button>
              <button className="secondary" onClick={() => getAiDraft(concern)} disabled={loading}>
                {loading ? "Analyzing..." : "Get AI-assisted draft (optional)"}
              </button>
            </div>

            {err && <div className="error-box">{err}</div>}

            {ai && (
              <div className="panel" style={{ marginTop: 12 }}>
                <div className="flow-step-title">AI-assisted draft — for reference only</div>
                {ai.degraded && (
                  <div className="degraded-box">AI analysis was unavailable. Escalate directly to a human reviewer.</div>
                )}
                {ai.mock && (
                  <div className="mock-box">
                    LLM_MOCK_MODE is on — this is canned demo data, not a real LLM generation.
                  </div>
                )}

                <h3>Risk flags</h3>
                <ul>
                  {ai.risk_flags.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>

                <h3>Summary</h3>
                <p>{ai.summary}</p>

                <h3>Recommended next steps</h3>
                <ul>
                  {ai.recommended_next_steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>

                <h3>Draft internal note</h3>
                <pre>{ai.draft_internal_note}</pre>

                <button className="secondary" onClick={() => useAiDraftAsStartingPoint(concern.concern_id)}>
                  Use this as my starting point above
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
