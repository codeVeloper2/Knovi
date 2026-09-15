/**
 * SyncGapCheckPage — /app/sync/gap/:sessionId
 * Gap Check + Summary — phase 4 of sync.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";
import "../solo/solo.css";

export default function SyncGapCheckPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [runningGapCheck, setRunningGapCheck] = useState(false);

  useEffect(() => {
    api.syncGetSession(sessionId)
      .then(s => {
        setSession(s);
        // If not yet in gap check, run it
        if (s.phase === "QUIZ") {
          setRunningGapCheck(true);
          api.syncRunGapCheck(sessionId)
            .then(res => setSession(res.session))
            .catch(() => {})
            .finally(() => setRunningGapCheck(false));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  async function handleComplete() {
    setCompleting(true);
    try {
      await api.syncComplete(sessionId);
      navigate(`/app/sync/complete/${sessionId}`);
    } catch { } finally { setCompleting(false); }
  }

  if (loading || runningGapCheck) return (
    <div className="solo-shell">
      <div className="solo-loading">
        <div className="solo-spinner" />
        {runningGapCheck ? "Analysing session…" : "Loading…"}
      </div>
    </div>
  );

  if (!session) return (
    <div className="solo-shell">
      <div className="solo-empty"><div className="solo-empty-icon">⚠️</div><p>Session not found.</p></div>
    </div>
  );

  const myRole = session.myRole;
  const gap = session.gapSummary;
  const myData = gap ? (myRole === "initiator" ? gap.initiator : gap.partner) : null;
  const partner = myRole === "initiator" ? session.partner : session.initiator;

  return (
    <div className="solo-shell">
      <div className="solo-breadcrumb">
        <Link to="/app/sync">Sync</Link>
        <span className="bc-sep">›</span>
        <span className="bc-current">Gap Check</span>
      </div>

      {/* Phase bar */}
      <div style={{ padding: "12px 24px" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {["Warmup", "Explain", "Quiz", "Gap Check"].map((ph, i) => (
            <div key={ph} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ height: 4, borderRadius: 99, background: i < 3 ? "#22c55e" : "#4f6ef7", marginBottom: 4 }} />
              <div style={{ fontSize: 10, color: i === 3 ? "#e2e8f0" : "#64748b", fontWeight: i === 3 ? 700 : 400 }}>{ph}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "0 24px 24px", display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
        {/* Left — gap summary */}
        <div className="solo-card">
          {/* Success banner */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24, padding: "16px 18px", background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(34,197,94,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>✓</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#22c55e" }}>Sync Complete!</div>
              <div style={{ fontSize: 13, color: "#64748b" }}>
                Great job! You both demonstrated a strong understanding of this concept.
              </div>
            </div>
          </div>

          <div style={{ fontSize: 14, fontWeight: 600, color: "#94a3b8", marginBottom: 16 }}>Session Summary</div>

          {/* Strengths */}
          {myData?.strengths?.length > 0 && (
            <div className="gap-section">
              <div className="gap-section-label strong">✓ Key Strengths</div>
              <div className="gap-list">
                {myData.strengths.map((s, i) => (
                  <div key={i} className="gap-item">
                    <span className="gap-icon ok">✓</span>
                    {s}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gaps */}
          {myData?.gaps?.length > 0 ? (
            <div className="gap-section">
              <div className="gap-section-label review">⚠ Areas to Review</div>
              <div className="gap-list">
                {myData.gaps.map((g, i) => (
                  <div key={i} className="gap-item">
                    <span className="gap-icon warn">⚠</span>
                    {g.description}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            !gap && (
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
                No gaps detected. Great work!
              </div>
            )
          )}

          {!gap && (
            <div style={{ fontSize: 13, color: "#64748b", padding: "12px 16px", background: "#081325", borderRadius: 10, marginBottom: 16 }}>
              Session data is still being analysed. Completing now will still record your progress.
            </div>
          )}

          <div className="btn-row">
            {myData?.gaps?.length > 0 && (
              <button
                className="btn-secondary"
                onClick={() => navigate(`/app/solo/concepts/${session.conceptId}/lesson`)}
              >
                Review These Topics
              </button>
            )}
            <button
              className="btn-primary"
              onClick={handleComplete}
              disabled={completing}
            >
              {completing ? "Saving…" : "View Full Summary →"}
            </button>
          </div>
        </div>

        {/* Right — partner summary */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="solo-card-sm">
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>Your Session Partner</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div className="peer-avatar" style={{ width: 40, height: 40, fontSize: 16 }}>
                {partner?.photoURL
                  ? <img src={partner.photoURL} alt={partner.displayName} referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : (partner?.displayName || "P")[0]}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>{partner?.displayName}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>Sync partner</div>
              </div>
            </div>
          </div>

          <div className="solo-card-sm">
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>Overall Understanding</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: myData?.gaps?.length === 0 ? "#22c55e" : "#f59e0b" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: myData?.gaps?.length === 0 ? "#22c55e" : "#f59e0b" }}>
                {myData?.gaps?.length === 0 ? "Strong" : "Good with gaps"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
