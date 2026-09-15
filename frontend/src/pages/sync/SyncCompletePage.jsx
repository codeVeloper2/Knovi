/**
 * SyncCompletePage — /app/sync/complete/:sessionId
 * Post-sync next steps screen.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";
import "../solo/solo.css";

export default function SyncCompletePage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.syncGetSession(sessionId)
      .then(setSession)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) return (
    <div className="solo-shell">
      <div className="solo-loading"><div className="solo-spinner" />Loading…</div>
    </div>
  );

  if (!session) return (
    <div className="solo-shell">
      <div className="solo-empty"><div className="solo-empty-icon">⚠️</div><p>Session not found.</p></div>
    </div>
  );

  const myRole = session.myRole;
  const gap = session.gapSummary;
  const myGaps = gap ? (myRole === "initiator" ? gap.initiator?.gaps : gap.partner?.gaps) : [];
  const partner = myRole === "initiator" ? session.partner : session.initiator;

  return (
    <div className="solo-shell">
      <div style={{ padding: "40px 24px 24px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 60, marginBottom: 12 }}>🎉</div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#e2e8f0", margin: "0 0 8px" }}>
            Sync Complete!
          </h1>
          <p style={{ fontSize: 15, color: "#64748b", maxWidth: 420 }}>
            You successfully verified your understanding of <strong style={{ color: "#e2e8f0" }}>{session.concept?.name}</strong> with a peer.
          </p>
        </div>

        {/* Checkpoint progress */}
        <div className="solo-card" style={{ width: "100%", maxWidth: 520, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 }}>
            Checkpoint Progress
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 14, color: "#e2e8f0" }}>Solo Learning</div>
              <div style={{ padding: "4px 12px", background: "rgba(34,197,94,0.1)", color: "#22c55e", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                ● Passed
              </div>
            </div>
            <div style={{ height: 1, background: "#1e293b" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 14, color: "#e2e8f0" }}>Sync Session</div>
              <div style={{ padding: "4px 12px", background: "rgba(34,197,94,0.1)", color: "#22c55e", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                ● Completed
              </div>
            </div>
            {myGaps?.length > 0 && (
              <>
                <div style={{ height: 1, background: "#1e293b" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 14, color: "#e2e8f0" }}>Learning gaps</div>
                  <div style={{ padding: "4px 12px", background: "rgba(245,158,11,0.1)", color: "#f59e0b", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                    {myGaps.length} concept{myGaps.length !== 1 ? "s" : ""} to review
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* CTA */}
        <div className="btn-row" style={{ justifyContent: "center", marginBottom: 20 }}>
          <button
            className="btn-primary"
            onClick={() => navigate(`/app/solo/topics/${session.topic?.id || ""}`)}
          >
            Continue to Next Concept →
          </button>
          <button
            className="btn-secondary"
            onClick={() => navigate("/app/sync/history")}
          >
            View Sync Details
          </button>
        </div>

        {/* Partner */}
        {partner && (
          <div style={{ fontSize: 13, color: "#64748b" }}>
            Session with <strong style={{ color: "#94a3b8" }}>{partner.displayName}</strong>
          </div>
        )}
      </div>
    </div>
  );
}
