import { useEffect, useState } from "react";
import { apiGet, apiPost, ApiError } from "../api";

interface FlaggedCall {
  call_id: string;
  client_name: string;
  transcript_snippet: string;
  flag_reason: string;
}

interface QASuggestion {
  call_id: string;
  category: string;
  confidence: string;
  reasoning: string;
  degraded: boolean;
  mock: boolean;
}

const CATEGORIES = ["wrong_outcome", "incorrect_statement", "dropped_early", "unclear"];

const CATEGORY_LABELS: Record<string, string> = {
  wrong_outcome: "Wrong outcome",
  incorrect_statement: "Incorrect statement",
  dropped_early: "Dropped early",
  unclear: "Unclear",
};

/** Compact category picker reused both in the pending list and inline in the table. */
function CategoryPicker({
  suggestion,
  selected,
  onPick,
}: {
  suggestion?: QASuggestion;
  selected?: string;
  onPick: (category: string) => void;
}) {
  return (
    <div className="category-picker">
      {CATEGORIES.map((cat) => {
        const isSuggested = suggestion?.category === cat;
        const isSelected = selected === cat;
        return (
          <button
            key={cat}
            className={`category-option${isSelected ? " category-option-chosen" : ""}${
              isSuggested && !isSelected ? " category-option-suggested" : ""
            }`}
            onClick={() => onPick(cat)}
          >
            {CATEGORY_LABELS[cat]}
            {isSuggested && <span className="category-ai-tag">AI</span>}
          </button>
        );
      })}
    </div>
  );
}

export default function QAReview() {
  const [flags, setFlags] = useState<FlaggedCall[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, QASuggestion>>({});
  // "confirmed" = actually saved; "pending" = selected but not saved/cancelled yet
  const [confirmed, setConfirmed] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, string>>({});
  const [rowLoading, setRowLoading] = useState<Record<string, boolean>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [loadingFlags, setLoadingFlags] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    loadFlags();
  }, []);

  async function loadFlags() {
    setLoadingFlags(true);
    setListError(null);
    try {
      const data = await apiGet<FlaggedCall[]>("/api/qa-review/flags");
      setFlags(data);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoadingFlags(false);
    }
  }

  async function getSuggestion(call: FlaggedCall) {
    setRowLoading((prev) => ({ ...prev, [call.call_id]: true }));
    setRowError((prev) => ({ ...prev, [call.call_id]: "" }));
    try {
      const result = await apiPost<QASuggestion>("/api/qa-review/categorize", call);
      setSuggestions((prev) => ({ ...prev, [call.call_id]: result }));
    } catch (err) {
      setRowError((prev) => ({
        ...prev,
        [call.call_id]: err instanceof ApiError ? err.message : "Something went wrong.",
      }));
    } finally {
      setRowLoading((prev) => ({ ...prev, [call.call_id]: false }));
    }
  }

  function selectCategory(callId: string, category: string) {
    setPending((prev) => ({ ...prev, [callId]: category }));
  }

  function saveCategory(callId: string) {
    setPending((prev) => {
      const category = prev[callId];
      if (category) setConfirmed((c) => ({ ...c, [callId]: category }));
      const next = { ...prev };
      delete next[callId];
      return next;
    });
  }

  function cancelSelection(callId: string) {
    setPending((prev) => {
      const next = { ...prev };
      delete next[callId];
      return next;
    });
  }

  function editCategory(callId: string) {
    setPending((prev) => ({ ...prev, [callId]: confirmed[callId] }));
  }

  const categorizedCalls = flags.filter((call) => confirmed[call.call_id] !== undefined);
  const pendingCalls = flags.filter((call) => confirmed[call.call_id] === undefined);

  return (
    <div className="panel">
      <h2>QA review of flagged calls</h2>
      <p className="loading">
        Each row is a call a supervisor flagged for a quality issue. Categorizing is a call
        <strong> you</strong> make — pick a category, then Save it. "Get AI suggestion" is an
        optional first opinion, not the final answer, so a wrong AI guess never gets recorded
        without a human looking at it.
      </p>

      {loadingFlags && <p className="loading">Loading flagged calls...</p>}
      {listError && (
        <div className="error-box">
          {listError} <button className="secondary" onClick={loadFlags}>Retry</button>
        </div>
      )}

      {categorizedCalls.length > 0 && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="flow-step-title">Categorized ({categorizedCalls.length})</div>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Call</th>
                  <th>Client</th>
                  <th>Category</th>
                  <th>Details</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {categorizedCalls.map((call) => {
                  const category = confirmed[call.call_id];
                  const suggestion = suggestions[call.call_id];
                  const pendingCategory = pending[call.call_id];
                  const isEditing = pendingCategory !== undefined;
                  const hasUnsavedChange = isEditing && pendingCategory !== category;
                  const details =
                    suggestion && suggestion.category === category
                      ? suggestion.reasoning
                      : "Manually categorized";

                  return (
                    <tr key={call.call_id}>
                      <td>{call.call_id}</td>
                      <td>{call.client_name}</td>
                      <td colSpan={isEditing ? 2 : 1}>
                        {isEditing ? (
                          <CategoryPicker
                            suggestion={suggestion}
                            selected={pendingCategory}
                            onPick={(cat) => selectCategory(call.call_id, cat)}
                          />
                        ) : (
                          <span className={`badge badge-${category}`}>{CATEGORY_LABELS[category]}</span>
                        )}
                      </td>
                      {!isEditing && <td className="flow-step-meta">{details}</td>}
                      <td>
                        {isEditing ? (
                          hasUnsavedChange ? (
                            <div className="button-row">
                              <button className="primary" onClick={() => saveCategory(call.call_id)}>
                                Save
                              </button>
                              <button className="secondary" onClick={() => cancelSelection(call.call_id)}>
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button className="secondary" onClick={() => cancelSelection(call.call_id)}>
                              Done
                            </button>
                          )
                        ) : (
                          <button className="secondary" onClick={() => editCategory(call.call_id)}>
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

      {pendingCalls.map((call) => {
        const suggestion = suggestions[call.call_id];
        const pendingCategory = pending[call.call_id];
        const isLoading = rowLoading[call.call_id];
        const err = rowError[call.call_id];

        return (
          <div className="flow-step" key={call.call_id}>
            <div className="flow-step-title">
              {call.call_id} — {call.client_name}
            </div>
            <div className="flow-step-meta">Flag reason: {call.flag_reason}</div>
            <div className="flow-step-meta">"{call.transcript_snippet}"</div>

            <CategoryPicker
              suggestion={suggestion}
              selected={pendingCategory}
              onPick={(cat) => selectCategory(call.call_id, cat)}
            />

            {pendingCategory !== undefined && (
              <div className="button-row" style={{ marginTop: 6 }}>
                <button className="primary" onClick={() => saveCategory(call.call_id)}>
                  Save
                </button>
                <button className="secondary" onClick={() => cancelSelection(call.call_id)}>
                  Cancel
                </button>
              </div>
            )}

            {!suggestion && (
              <button className="secondary" style={{ marginTop: 8 }} onClick={() => getSuggestion(call)} disabled={isLoading}>
                {isLoading ? "Asking the LLM..." : "Get AI suggestion"}
              </button>
            )}

            {err && <div className="error-box">{err}</div>}

            {suggestion && (
              <div className="flow-step-meta" style={{ marginTop: 8 }}>
                AI suggested <strong>{CATEGORY_LABELS[suggestion.category]}</strong> (confidence: {suggestion.confidence}) — {suggestion.reasoning}
                {suggestion.degraded && (
                  <div className="degraded-box">AI suggestion unavailable — categorize manually instead.</div>
                )}
                {suggestion.mock && (
                  <div className="mock-box">LLM_MOCK_MODE is on — this suggestion came from a keyword heuristic, not the LLM.</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
