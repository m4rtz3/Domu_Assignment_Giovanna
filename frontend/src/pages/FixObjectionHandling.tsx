import { useEffect, useState } from "react";
import { apiGet, apiPost, ApiError } from "../api";

interface ObjectionIssue {
  issue_id: string;
  client_name: string;
  current_prompt: string;
  problem_description: string;
}

interface FixResponse {
  diagnosis: string;
  what_changed: string[];
  updated_prompt: string;
  degraded: boolean;
  mock: boolean;
}

export default function FixObjectionHandling() {
  const [issues, setIssues] = useState<ObjectionIssue[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // draftPrompt = whatever's in "your revised prompt" right now (pending or being re-edited);
  // savedPrompt = committed -- an issue moves to the "Fixed" table once this is set.
  const [draftPrompt, setDraftPrompt] = useState<Record<string, string>>({});
  const [savedPrompt, setSavedPrompt] = useState<Record<string, string>>({});
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());

  const [aiResults, setAiResults] = useState<Record<string, FixResponse>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [aiError, setAiError] = useState<Record<string, string>>({});

  useEffect(() => {
    loadIssues();
  }, []);

  async function loadIssues() {
    setLoadingIssues(true);
    setListError(null);
    try {
      const data = await apiGet<ObjectionIssue[]>("/api/fix-objection-handling/issues");
      setIssues(data);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoadingIssues(false);
    }
  }

  async function getAiFix(issue: ObjectionIssue) {
    setAiLoading((prev) => ({ ...prev, [issue.issue_id]: true }));
    setAiError((prev) => ({ ...prev, [issue.issue_id]: "" }));
    try {
      const response = await apiPost<FixResponse>("/api/fix-objection-handling", {
        client_name: issue.client_name,
        current_prompt: issue.current_prompt,
        problem_description: issue.problem_description,
      });
      setAiResults((prev) => ({ ...prev, [issue.issue_id]: response }));
    } catch (err) {
      setAiError((prev) => ({
        ...prev,
        [issue.issue_id]: err instanceof ApiError ? err.message : "Something went wrong.",
      }));
    } finally {
      setAiLoading((prev) => ({ ...prev, [issue.issue_id]: false }));
    }
  }

  function updateDraft(issueId: string, value: string) {
    setDraftPrompt((prev) => ({ ...prev, [issueId]: value }));
  }

  function copyCurrentPromptAsStart(issue: ObjectionIssue) {
    if ((draftPrompt[issue.issue_id] ?? "").trim() && !window.confirm("Replace what you've written with the current prompt?"))
      return;
    setDraftPrompt((prev) => ({ ...prev, [issue.issue_id]: issue.current_prompt }));
  }

  function useAiPrompt(issueId: string) {
    const ai = aiResults[issueId];
    if (!ai) return;
    if ((draftPrompt[issueId] ?? "").trim() && !window.confirm("Replace your revised prompt with the AI's version?"))
      return;
    setDraftPrompt((prev) => ({ ...prev, [issueId]: ai.updated_prompt }));
  }

  function save(issueId: string) {
    setSavedPrompt((prev) => ({ ...prev, [issueId]: draftPrompt[issueId] ?? "" }));
    setEditingIds((prev) => {
      const next = new Set(prev);
      next.delete(issueId);
      return next;
    });
  }

  function startEditing(issueId: string) {
    setEditingIds((prev) => new Set(prev).add(issueId));
  }

  function cancelEditing(issueId: string) {
    setDraftPrompt((prev) => ({ ...prev, [issueId]: savedPrompt[issueId] ?? "" }));
    setEditingIds((prev) => {
      const next = new Set(prev);
      next.delete(issueId);
      return next;
    });
  }

  const fixed = issues.filter((i) => savedPrompt[i.issue_id] !== undefined);
  const pending = issues.filter((i) => savedPrompt[i.issue_id] === undefined);

  return (
    <div className="panel">
      <h2>Fix poor objection handling</h2>
      <p className="loading">
        Each row below is a client report that the agent handles payment objections poorly —
        this is yours to diagnose and fix. Edit the revised prompt directly, and optionally ask
        for an AI-assisted diagnosis and draft fix if you want a starting point.
      </p>

      {loadingIssues && <p className="loading">Loading flagged issues...</p>}
      {listError && (
        <div className="error-box">
          {listError} <button className="secondary" onClick={loadIssues}>Retry</button>
        </div>
      )}

      {fixed.length > 0 && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="flow-step-title">Fixed ({fixed.length})</div>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Client</th>
                  <th>Revised prompt</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {fixed.map((issue) => {
                  const isEditing = editingIds.has(issue.issue_id);
                  const draft = draftPrompt[issue.issue_id] ?? "";
                  return (
                    <tr key={issue.issue_id}>
                      <td>{issue.issue_id}</td>
                      <td>{issue.client_name}</td>
                      <td style={{ maxWidth: isEditing ? "none" : 320 }}>
                        {isEditing ? (
                          <textarea value={draft} onChange={(e) => updateDraft(issue.issue_id, e.target.value)} />
                        ) : (
                          <span className="flow-step-meta">{savedPrompt[issue.issue_id]}</span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <div className="button-row">
                            <button className="primary" onClick={() => save(issue.issue_id)}>
                              Save
                            </button>
                            <button className="secondary" onClick={() => cancelEditing(issue.issue_id)}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button className="secondary" onClick={() => startEditing(issue.issue_id)}>
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

      {pending.map((issue) => {
        const ai = aiResults[issue.issue_id];
        const loading = aiLoading[issue.issue_id];
        const err = aiError[issue.issue_id];
        const draft = draftPrompt[issue.issue_id] ?? "";

        return (
          <div className="flow-step" key={issue.issue_id}>
            <div className="flow-step-title">
              {issue.issue_id} — {issue.client_name}
            </div>
            <div className="flow-step-meta">Problem: {issue.problem_description}</div>
            <div className="flow-step-meta">Current prompt: "{issue.current_prompt}"</div>

            <div className="button-row" style={{ marginTop: 12, justifyContent: "space-between" }}>
              <label style={{ margin: 0 }}>Your revised prompt</label>
              <button className="secondary" onClick={() => copyCurrentPromptAsStart(issue)}>
                Start from current prompt
              </button>
            </div>
            <textarea
              placeholder="Write your revised prompt here, or click 'Start from current prompt' to edit from what's already live."
              value={draft}
              onChange={(e) => updateDraft(issue.issue_id, e.target.value)}
              style={{ minHeight: 140 }}
            />

            <div className="button-row" style={{ marginTop: 8 }}>
              <button className="primary" onClick={() => save(issue.issue_id)} disabled={!draft.trim()}>
                Save
              </button>
              <button className="secondary" onClick={() => getAiFix(issue)} disabled={loading}>
                {loading ? "Diagnosing..." : "Get AI-assisted diagnosis & fix (optional)"}
              </button>
            </div>

            {err && <div className="error-box">{err}</div>}

            {ai && (
              <div className="panel" style={{ marginTop: 12 }}>
                <div className="flow-step-title">AI-assisted draft — for reference only</div>
                {ai.degraded && (
                  <div className="degraded-box">AI diagnosis was unavailable. Try again shortly.</div>
                )}
                {ai.mock && (
                  <div className="mock-box">
                    LLM_MOCK_MODE is on — this is canned demo data, not a real LLM generation.
                  </div>
                )}

                <h3>Diagnosis</h3>
                <p>{ai.diagnosis}</p>

                <h3>What changed</h3>
                <ul>
                  {ai.what_changed.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>

                <h3>Updated agent system prompt</h3>
                <pre>{ai.updated_prompt}</pre>
                <button className="secondary" onClick={() => useAiPrompt(issue.issue_id)}>
                  Use this as my revised prompt above
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
