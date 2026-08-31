import { useEffect, useState } from "react";
import { apiGet, apiPost, ApiError } from "../api";

interface CallAttemptCheck {
  attempt_id: string;
  client_name: string;
  region: string;
  attempted_at: string;
  compliant: boolean;
  violation_reason: string | null;
}

interface CallAttemptRow extends CallAttemptCheck {
  justAdded?: boolean; // client-side only, so newly-checked rows are visually distinct
}

interface RegionWindow {
  label: string;
  start_hour: number;
  end_hour: number;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CallingCompliance() {
  const [attempts, setAttempts] = useState<CallAttemptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [regions, setRegions] = useState<Record<string, RegionWindow>>({});
  const [checkClient, setCheckClient] = useState("Meridian Bank");
  const [checkRegion, setCheckRegion] = useState("");
  const [checkTime, setCheckTime] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  useEffect(() => {
    load();
    loadRegions();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await apiGet<CallAttemptCheck[]>("/api/calling-compliance");
      setAttempts(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function loadRegions() {
    try {
      const result = await apiGet<Record<string, RegionWindow>>("/api/calling-compliance/regions");
      setRegions(result);
      setCheckRegion(Object.keys(result)[0] ?? "");
    } catch {
      // non-critical -- the checker form just won't have a populated dropdown
    }
  }

  async function runCheck() {
    setChecking(true);
    setCheckError(null);
    try {
      const result = await apiPost<CallAttemptCheck>("/api/calling-compliance/check", {
        client_name: checkClient,
        region: checkRegion,
        attempted_at: checkTime,
      });
      // Add it straight into the list below instead of showing an isolated result --
      // that's the same "is this call attempt compliant?" question the table answers,
      // so a call you're about to make belongs in the same place as ones already made.
      // The backend returns a generic id for every ad-hoc check, so give it a unique one
      // here -- otherwise checking twice would produce two rows with the same React key.
      const uniqueRow = { ...result, attempt_id: `manual-${Date.now()}`, justAdded: true };
      setAttempts((prev) => [uniqueRow, ...prev]);
      setCheckTime("");
    } catch (err) {
      setCheckError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setChecking(false);
    }
  }

  const violations = attempts.filter((a) => !a.compliant).length;

  return (
    <div className="panel">
      <h2>Calling windows &amp; holiday check</h2>
      <p className="loading">
        Confirm targets are being called at the right times, cross-referenced against permitted
        calling hours by region and the holiday calendar — pure rule-checking, no LLM involved.
        Check a call below before dialing; it's added to the list so everything you've confirmed
        lives in one place. The hour windows and holiday list here are illustrative demo data,
        not verified legal guidance; a real version would source these from Domu's compliance
        team per region.
      </p>

      <div className="panel">
        <div className="flow-step-title">Check a call before dialing</div>

        <label htmlFor="check-client">Client</label>
        <input id="check-client" type="text" value={checkClient} onChange={(e) => setCheckClient(e.target.value)} />

        <label htmlFor="check-region">Region</label>
        <select id="check-region" value={checkRegion} onChange={(e) => setCheckRegion(e.target.value)}>
          {Object.entries(regions).map(([code, w]) => (
            <option key={code} value={code}>
              {w.label} ({code})
            </option>
          ))}
        </select>

        <label htmlFor="check-time">Proposed call time (local to that region)</label>
        <div className="inline-check-row">
          <input
            id="check-time"
            type="datetime-local"
            value={checkTime}
            onChange={(e) => setCheckTime(e.target.value)}
          />
          <button
            className="primary"
            onClick={runCheck}
            disabled={checking || !checkClient.trim() || !checkRegion || !checkTime}
          >
            {checking ? "Checking..." : "Check & add below"}
          </button>
        </div>

        {checkError && <div className="error-box">{checkError}</div>}
      </div>

      {loading && <p className="loading">Loading...</p>}
      {error && (
        <div className="error-box">
          {error} <button className="secondary" onClick={load}>Retry</button>
        </div>
      )}

      {!loading && !error && (
        <>
          <p className="flow-step-meta">
            {violations} of {attempts.length} attempts fall outside permitted hours/holidays.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Attempt</th>
                  <th>Client</th>
                  <th>Region</th>
                  <th>Attempted at</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.attempt_id} style={a.justAdded ? { background: "rgba(108, 141, 255, 0.06)" } : undefined}>
                    <td>
                      {a.attempt_id}
                      {a.justAdded && <span className="category-ai-tag" style={{ marginLeft: 6 }}>NEW</span>}
                    </td>
                    <td>{a.client_name}</td>
                    <td>{a.region}</td>
                    <td>{formatDate(a.attempted_at)}</td>
                    <td>
                      {a.compliant ? (
                        <span className="badge badge-ok">Compliant</span>
                      ) : (
                        <span className="badge badge-wrong_outcome" title={a.violation_reason ?? ""}>
                          {a.violation_reason}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
