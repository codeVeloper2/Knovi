/**
 * SyncHistoryPage — /app/sync/history
 * Shows all past sync sessions with results and gaps.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as api from "../../api";
import "../solo/solo.css";

function timeAgo(isoStr) {
  if (!isoStr) return "";
  const diff = Date.now() - new Date(isoStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(isoStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function SyncHistoryPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("sessions"); // sessions | stats

  useEffect(() => {
    api.syncGetHistory()
      .then(setSessions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const completed = sessions.filter(s => s.result === "completed");
  const totalGaps = sessions.reduce((acc, s) => acc + (s.gapCount || 0), 0);

  if (loading) return (
    <div className="solo-shell">
      <div className="solo-loading"><div className="solo-spinner" />Loading history…</div>
    </div>
  );

  return (
    <div className="solo-shell">
      <div className="solo-page-header">
        <div>
          <div className="solo-page-title">Sync</div>
          <div className="solo-page-sub">Your recent sync sessions and progress.</div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 8, padding: "0 24px 16px" }}>
        <button
          className={`solo-tab ${tab === "sessions" ? "active" : ""}`}
          onClick={() => setTab("sessions")}
          style={{ cursor: "pointer" }}
        >
          Recent Sessions
        </button>
        <button
          className={`solo-tab ${tab === "stats" ? "active" : ""}`}
          onClick={() => setTab("stats")}
          style={{ cursor: "pointer" }}
        >
          Sync Stats
        </button>
      </div>

      {tab === "stats" && (
        <div style={{ padding: "0 24px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {[
            { label: "Total Syncs", value: sessions.length, icon: "🔗" },
            { label: "Completed", value: completed.length, icon: "✓" },
            { label: "Learning Gaps", value: totalGaps, icon: "⚠" },
            { label: "Success Rate", value: sessions.length ? `${Math.round(completed.length / sessions.length * 100)}%` : "—", icon: "📊" },
          ].map(s => (
            <div key={s.label} className="solo-card-sm" style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>{s.icon}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#e2e8f0" }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "sessions" && (
        <div className="sync-history-list">
          {sessions.length === 0 ? (
            <div className="solo-empty">
              <div className="solo-empty-icon">🔗</div>
              <p>No sync sessions yet.</p>
              <button className="btn-primary" onClick={() => navigate("/app/sync")}>
                Start a Sync
              </button>
            </div>
          ) : (
            sessions.map(s => (
              <div
                key={s.sessionId}
                className="sync-history-card"
                onClick={() => navigate(`/app/sync/complete/${s.sessionId}`)}
                style={{ cursor: "pointer" }}
              >
                {/* Avatar placeholder */}
                <div className="peer-avatar" style={{ width: 44, height: 44, fontSize: 16, flexShrink: 0 }}>
                  {s.partner?.photoURL
                    ? <img src={s.partner.photoURL} alt={s.partner.displayName} referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : (s.partner?.displayName || "P")[0]}
                </div>

                <div className="sync-history-info">
                  <div className="sync-history-concept">{s.conceptName}</div>
                  <div className="sync-history-meta">
                    {s.subjectName && `${s.subjectName} · `}{s.topicName}
                    {s.partner && ` · with ${s.partner.displayName}`}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <div className={`sync-history-result ${s.result}`}>
                      {s.result === "completed" ? "✓ Completed" : s.result}
                    </div>
                    {s.gapCount > 0 && (
                      <div style={{ fontSize: 12, color: "#f59e0b", background: "rgba(245,158,11,0.1)", padding: "2px 8px", borderRadius: 6 }}>
                        {s.gapCount} gap{s.gapCount !== 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ fontSize: 12, color: "#334155", whiteSpace: "nowrap", flexShrink: 0, alignSelf: "flex-start", marginTop: 2 }}>
                  {timeAgo(s.completedAt || s.createdAt)}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
