import { Fragment, useEffect, useMemo, useState } from "react";
import { apiGet, ApiError } from "../api";

interface ClientOutcomes {
  client_id: string;
  client_name: string;
  total_calls: number;
  answered: number;
  payment_secured: number;
  failed: number;
  answer_rate: number;
  conversion_rate: number;
  failure_rate: number;
  avg_handle_time_seconds: number | null;
  top_failure_reason: string | null;
  calls_by_day: Record<string, number> | null;
}

interface OutcomesSummary {
  clients: ClientOutcomes[];
  totals: ClientOutcomes;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

function csvCell(value: unknown): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(clients: ClientOutcomes[]) {
  const headers = [
    "Client",
    "Total calls",
    "Answered",
    "Payment secured",
    "Answer rate",
    "Conversion rate",
    "Failure rate",
    "Avg handle time (s)",
    "Top failure reason",
  ];
  const rows = clients.map((c) => [
    c.client_name,
    c.total_calls,
    c.answered,
    c.payment_secured,
    pct(c.answer_rate),
    pct(c.conversion_rate),
    pct(c.failure_rate),
    c.avg_handle_time_seconds ?? "",
    c.top_failure_reason ?? "",
  ]);
  // "sep=," is an Excel-specific hint (first line of the file) that forces it to split
  // columns on commas regardless of the machine's regional settings -- without it, Excel set
  // to a locale where "," is the decimal separator (e.g. pt-BR) opens everything as one column.
  const csv =
    "sep=,\r\n" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");

  // Leading BOM (as an escape, not a literal character -- avoids any risk of the editor/tool
  // mangling an invisible byte) so Excel recognizes the file as UTF-8 instead of guessing a
  // local codepage.
  const BOM = String.fromCharCode(0xfeff);
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "domu-outcomes.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export default function Dashboard() {
  const [data, setData] = useState<OutcomesSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await apiGet<OutcomesSummary>("/api/outcomes");
      setData(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function toggleExpanded(clientId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }

  const filteredClients = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.clients;
    return data.clients.filter((c) => c.client_name.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <div className="panel">
      <h2>Cross-client outcomes</h2>
      <p className="loading">
        Pulls call outcome data across all 7 clients and summarizes answer rate, conversion
        rate and failure rate — the kind of number you'd otherwise pull manually from each
        client's dashboard every week. Click a row for more detail.
      </p>

      {loading && <p className="loading">Loading...</p>}
      {error && (
        <div className="error-box">
          {error} <button className="secondary" onClick={load}>Retry</button>
        </div>
      )}

      {data && (
        <>
          <div className="dashboard-toolbar">
            <input
              type="text"
              placeholder="Filter by client name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 260 }}
            />
            <button className="secondary" onClick={() => downloadCsv(data.clients)}>
              Download CSV
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Client</th>
                  <th>Total calls</th>
                  <th>Answered</th>
                  <th>Payment secured</th>
                  <th>Answer rate</th>
                  <th>Conversion rate</th>
                  <th>Failure rate</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((c) => {
                  const isOpen = expanded.has(c.client_id);
                  const maxDay = c.calls_by_day ? Math.max(...Object.values(c.calls_by_day)) : 0;

                  return (
                    <Fragment key={c.client_id}>
                      <tr
                        className="clickable-row"
                        onClick={() => toggleExpanded(c.client_id)}
                      >
                        <td className="expand-arrow">{isOpen ? "▾" : "▸"}</td>
                        <td>{c.client_name}</td>
                        <td>{c.total_calls.toLocaleString()}</td>
                        <td>{c.answered.toLocaleString()}</td>
                        <td>{c.payment_secured.toLocaleString()}</td>
                        <td>{pct(c.answer_rate)}</td>
                        <td>{pct(c.conversion_rate)}</td>
                        <td>{pct(c.failure_rate)}</td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td />
                          <td colSpan={7}>
                            <div className="row-detail">
                              <div className="stat-tile">
                                <div className="stat-tile-label">Avg handle time</div>
                                <div className="stat-tile-value">{formatDuration(c.avg_handle_time_seconds)}</div>
                              </div>
                              <div className="stat-tile">
                                <div className="stat-tile-label">Top failure reason</div>
                                <div className="stat-tile-value">{c.top_failure_reason ?? "—"}</div>
                              </div>
                              {c.calls_by_day && (
                                <div className="day-bars-tile">
                                  <div className="stat-tile-label">Calls by day</div>
                                  <div className="day-bars-row">
                                    {Object.entries(c.calls_by_day).map(([day, count]) => (
                                      <div className="day-bar" key={day}>
                                        <div className="day-bar-track">
                                          <div
                                            className="day-bar-fill"
                                            style={{ height: `${maxDay ? (count / maxDay) * 100 : 0}%` }}
                                            title={`${day}: ${count}`}
                                          />
                                        </div>
                                        <div className="day-bar-label">{day}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {filteredClients.length === 0 && (
                  <tr>
                    <td colSpan={8} className="flow-step-meta">
                      No clients match "{search}".
                    </td>
                  </tr>
                )}
                <tr style={{ fontWeight: 600 }}>
                  <td />
                  <td>All clients</td>
                  <td>{data.totals.total_calls.toLocaleString()}</td>
                  <td>{data.totals.answered.toLocaleString()}</td>
                  <td>{data.totals.payment_secured.toLocaleString()}</td>
                  <td>{pct(data.totals.answer_rate)}</td>
                  <td>{pct(data.totals.conversion_rate)}</td>
                  <td>{pct(data.totals.failure_rate)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
