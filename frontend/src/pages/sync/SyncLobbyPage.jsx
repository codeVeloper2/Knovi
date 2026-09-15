/**
 * SyncLobbyPage — /app/sync/lobby/:sessionId
 * Waiting room — both participants must be ready before session starts.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";
import "../solo/solo.css";

const PHASES = [
  { key: "WARMUP",    label: "Warm-up",  time: "0–2 min",   desc: "Quick questions to confirm understanding" },
  { key: "EXPLAIN",   label: "Explain",  time: "2–7 min",   desc: "Each peer explains the concept" },
  { key: "QUIZ",      label: "Quiz",     time: "7–12 min",  desc: "Ask and answer questions" },
  { key: "GAP_CHECK", label: "Gap Check","time": "12–15 min", desc: "Review and get feedback" },
];

function PeerAvatar({ name, photo, size = 48 }) {
  const initial = (name || "?")[0].toUpperCase();
  return (
    <div className="peer-avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {photo ? <img src={photo} alt={name} referrerPolicy="no-referrer" /> : initial}
    </div>
  );
}

export default function SyncLobbyPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const wsRef = useRef(null);

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.syncGetSession(sessionId)
      .then(setSession)
      .catch(() => setError("Session not found."))
      .finally(() => setLoading(false));
  }, [sessionId]);

  // WebSocket for real-time updates
  useEffect(() => {
    const ws = api.openSyncSocket(sessionId, msg => {
      if (msg.type === "session_updated" || msg.type === "partner_joined") {
        api.syncGetSession(sessionId).then(setSession).catch(() => {});
      }
      if (msg.type === "phase_changed" && msg.data.phase === "WARMUP") {
        navigate(`/app/sync/session/${sessionId}`, { replace: true });
      }
    }, () => {});
    wsRef.current = ws;
    return () => ws.close();
  }, [sessionId]);

  // Auto-advance when session phase changes
  useEffect(() => {
    if (session?.phase === "WARMUP") {
      navigate(`/app/sync/session/${sessionId}`, { replace: true });
    }
  }, [session?.phase]);

  // Poll for partner joining
  useEffect(() => {
    const iv = setInterval(() => {
      api.syncGetSession(sessionId).then(setSession).catch(() => {});
    }, 5000);
    return () => clearInterval(iv);
  }, [sessionId]);

  async function handleReady() {
    setMarking(true);
    setError(null);
    try {
      const updated = await api.syncMarkReady(sessionId);
      setSession(updated);
    } catch (e) {
      setError(e?.message || "Could not mark ready. Waiting for partner to join.");
    } finally {
      setMarking(false);
    }
  }

  if (loading) return (
    <div className="solo-shell">
      <div className="solo-loading"><div className="solo-spinner" />Loading lobby…</div>
    </div>
  );

  if (error && !session) return (
    <div className="solo-shell">
      <div className="solo-empty"><div className="solo-empty-icon">⚠️</div><p>{error}</p></div>
    </div>
  );

  if (!session) return null;

  const myRole = session.myRole;
  const imInitiator = myRole === "initiator";
  const myReady = imInitiator ? session.initiatorReady : session.partnerReady;
  const partnerReady = imInitiator ? session.partnerReady : session.initiatorReady;
  const partner = imInitiator ? session.partner : session.initiator;
  const hasPartner = !!session.partnerId;

  return (
    <div className="solo-shell">
      <div className="solo-breadcrumb">
        <Link to="/app/sync">Sync</Link>
        <span className="bc-sep">›</span>
        <span className="bc-current">Sync Lobby</span>
      </div>

      <div className="solo-page-header">
        <div>
          <div className="solo-page-title">Sync Lobby</div>
          <div className="solo-page-sub">
            {hasPartner ? "Waiting for your partner to get ready…" : "Waiting for a partner to join…"}
          </div>
        </div>
      </div>

      <div style={{ padding: "0 24px 24px", display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
        {/* Left */}
        <div className="solo-card">
          {/* Concept info */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>
              {session.concept?.name || "Concept"}
            </div>
            <div style={{ fontSize: 13, color: "#64748b" }}>
              {session.subjectName && `${session.subjectName} · `}{session.topic?.name}
            </div>
          </div>

          {/* Participants */}
          <div className="sync-participants" style={{ marginBottom: 24 }}>
            {/* You */}
            <div className={`sync-participant ${myReady ? "sync-participant-ready" : ""}`}>
              <div className="peer-avatar" style={{ width: 48, height: 48, fontSize: 18, background: "rgba(79,110,247,0.2)", color: "#4f6ef7" }}>
                You
              </div>
              <div>
                <div className="sync-participant-name">You</div>
                <div className="sync-participant-status">
                  {myReady ? "✓ Ready" : "Not ready"}
                </div>
              </div>
            </div>

            <div className="sync-vs">⟷</div>

            {/* Partner */}
            {hasPartner ? (
              <div className={`sync-participant ${partnerReady ? "sync-participant-ready" : ""}`}>
                <PeerAvatar name={partner?.displayName} photo={partner?.photoURL} />
                <div>
                  <div className="sync-participant-name">{partner?.displayName || "Partner"}</div>
                  <div className="sync-participant-status">
                    {partnerReady ? "✓ Ready" : "Waiting…"}
                  </div>
                </div>
              </div>
            ) : (
              <div className="sync-participant" style={{ opacity: 0.5 }}>
                <div className="peer-avatar" style={{ width: 48, height: 48, fontSize: 18 }}>?</div>
                <div>
                  <div className="sync-participant-name">Partner</div>
                  <div className="sync-participant-status">Waiting to join…</div>
                </div>
              </div>
            )}
          </div>

          {/* Join code */}
          {session.sessionCode && (
            <div style={{ marginBottom: 20, padding: "12px 16px", background: "#081325", borderRadius: 10, border: "1px solid #1e293b" }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Share this code</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#4f6ef7", letterSpacing: 3 }}>
                {session.sessionCode}
              </div>
            </div>
          )}

          {/* Session time */}
          <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
            <div style={{ padding: "10px 16px", background: "#081325", borderRadius: 10, textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>15</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>min session</div>
            </div>
            <div style={{ padding: "10px 16px", background: "#081325", borderRadius: 10, textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>2–4</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>participants</div>
            </div>
            <div style={{ padding: "10px 16px", background: "#081325", borderRadius: 10, textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#22c55e" }}>✓</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>checkpoint</div>
            </div>
          </div>

          {error && (
            <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, fontSize: 13, color: "#ef4444", marginBottom: 14 }}>
              {error}
            </div>
          )}

          <div className="btn-row">
            {!myReady ? (
              <button
                className="btn-primary"
                onClick={handleReady}
                disabled={!hasPartner || marking}
              >
                {marking ? "Marking ready…" : hasPartner ? "I'm Ready →" : "Waiting for partner…"}
              </button>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#22c55e", fontWeight: 600 }}>
                <div className="solo-spinner" style={{ borderTopColor: "#22c55e" }} />
                {partnerReady ? "Starting session…" : "Waiting for partner to get ready…"}
              </div>
            )}
            <button className="btn-secondary" onClick={() => navigate("/app/sync")}>
              Cancel
            </button>
          </div>
        </div>

        {/* Right — session steps */}
        <div className="solo-card-sm">
          <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600, marginBottom: 14 }}>Session Steps</div>
          <div className="sync-phase-steps">
            {PHASES.map((ph, i) => (
              <div key={ph.key} className="sync-phase-step">
                <div className="sync-step-num">{i + 1}</div>
                <div className="sync-step-body">
                  <div className="sync-step-name">{ph.label} <span style={{ fontWeight: 400, color: "#334155", fontSize: 11 }}>— {ph.time}</span></div>
                  <div className="sync-step-time">{ph.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
