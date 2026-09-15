/**
 * SyncWelcomePage — /app/sync
 * Study Room launch / welcome. Shows eligible concepts + how sync works.
 */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import * as api from "../../api";
import "../solo/solo.css";

export default function SyncWelcomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preConceptId = searchParams.get("conceptId");

  const [eligible, setEligible] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.syncGetEligible()
      .then(setEligible)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // If a conceptId was passed, jump straight to find-partner
  useEffect(() => {
    if (preConceptId && !loading) {
      navigate(`/app/sync/find/${preConceptId}`, { replace: true });
    }
  }, [preConceptId, loading]);

  if (loading) return (
    <div className="solo-shell">
      <div className="solo-loading"><div className="solo-spinner" />Loading…</div>
    </div>
  );

  return (
    <div className="solo-shell">
      <div className="solo-page-header">
        <div>
          <div className="solo-page-title">Sync</div>
          <div className="solo-page-sub">Learn together. Verify understanding. Grow faster.</div>
        </div>
      </div>

      {/* Hero */}
      <div style={{ padding: "0 24px 24px" }}>
        <div className="solo-card" style={{ background: "linear-gradient(135deg, #0f1e35 0%, #0d1b2e 100%)", border: "1px solid #1e3a5f", textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", margin: "0 0 8px" }}>
            Ready to Sync?
          </h2>
          <p style={{ fontSize: 14, color: "#64748b", maxWidth: 360, margin: "0 auto 24px" }}>
            You've passed the checkpoint and can now verify your understanding with a peer.
          </p>
          {eligible.length > 0 ? (
            <button
              className="btn-primary"
              style={{ margin: "0 auto" }}
              onClick={() => navigate(`/app/sync/find/${eligible[0].conceptId}`)}
            >
              Find a Partner →
            </button>
          ) : (
            <div style={{ fontSize: 13, color: "#334155" }}>
              Pass a checkpoint to unlock Sync.
            </div>
          )}
        </div>
      </div>

      {/* Eligible concepts */}
      {eligible.length > 0 && (
        <div style={{ padding: "0 24px" }}>
          <div className="section-label" style={{ padding: 0, marginBottom: 12 }}>READY TO SYNC</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            {eligible.map(e => (
              <div key={e.conceptId} className="partner-card" style={{ cursor: "pointer" }}
                onClick={() => navigate(`/app/sync/find/${e.conceptId}`)}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(79,110,247,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                  ⚡
                </div>
                <div className="partner-card-info">
                  <div className="partner-card-name">{e.conceptName}</div>
                  <div className="partner-card-meta">{e.subjectName} · {e.topicName}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, color: "#22c55e", fontWeight: 600 }}>
                    {e.availablePartners} {e.availablePartners === 1 ? "student" : "students"} ready
                  </div>
                  <button className="connect-btn" style={{ marginTop: 6 }}>
                    Find Partner
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How Sync works */}
      <div style={{ padding: "0 24px 24px" }}>
        <div className="section-label" style={{ padding: 0, marginBottom: 12 }}>HOW SYNC WORKS</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {[
            { icon: "🎯", step: "1. Get Matched", desc: "Find a peer at the same checkpoint" },
            { icon: "⏱", step: "2. 15-Minute Session", desc: "Follow the structured sync flow" },
            { icon: "📊", step: "3. Track Progress", desc: "Get feedback and identify gaps" },
          ].map(({ icon, step, desc }) => (
            <div key={step} className="solo-card-sm" style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginBottom: 4 }}>{step}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
