/**
 * SyncFindPartnerPage — /app/sync/find/:conceptId
 * Shows available sync partners for a concept. User picks one or waits.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";
import "../solo/solo.css";

function PeerAvatar({ name, photo, size = 40 }) {
  const initial = (name || "?")[0].toUpperCase();
  return (
    <div className="peer-avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {photo ? <img src={photo} alt={name} referrerPolicy="no-referrer" /> : initial}
    </div>
  );
}

function timeAgo(isoStr) {
  if (!isoStr) return "";
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export default function SyncFindPartnerPage() {
  const { conceptId } = useParams();
  const navigate = useNavigate();

  const [partners, setPartners] = useState([]);
  const [conceptName, setConceptName] = useState("");
  const [topicName, setTopicName] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      api.syncGetPartners(conceptId),
      api.soloGetLesson(conceptId),
    ]).then(([pts, lesson]) => {
      setPartners(pts);
      setConceptName(lesson.concept.name);
      setTopicName(lesson.topic.name);
      setSubjectName(lesson.subject?.name || "");
    }).catch(() => {}).finally(() => setLoading(false));
  }, [conceptId]);

  async function handleConnect(partnerId) {
    setConnecting(partnerId);
    setError(null);
    try {
      const session = await api.syncCreateSession({
        concept_id: Number(conceptId),
        partner_id: partnerId,
      });
      navigate(`/app/sync/lobby/${session.id}`);
    } catch (e) {
      setError("Could not create session. Please try again.");
    } finally {
      setConnecting(null);
    }
  }

  async function handleOpenSession() {
    setConnecting("open");
    setError(null);
    try {
      const session = await api.syncCreateSession({ concept_id: Number(conceptId) });
      navigate(`/app/sync/lobby/${session.id}`);
    } catch {
      setError("Could not create session. Please try again.");
    } finally {
      setConnecting(null);
    }
  }

  if (loading) return (
    <div className="solo-shell">
      <div className="solo-loading"><div className="solo-spinner" />Finding partners…</div>
    </div>
  );

  return (
    <div className="solo-shell">
      <div className="solo-breadcrumb">
        <Link to="/app/sync">Sync</Link>
        <span className="bc-sep">›</span>
        <span className="bc-current">Find a Partner</span>
      </div>

      <div className="solo-page-header">
        <div>
          <div className="solo-page-title">Find a Sync Partner</div>
          <div className="solo-page-sub">Choose a topic and find a peer who's ready to sync with you.</div>
        </div>
      </div>

      <div style={{ padding: "0 24px 24px", display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
        {/* Left — partners */}
        <div>
          {/* Current checkpoint */}
          <div className="solo-card-sm" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>Your Current Checkpoint</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#e2e8f0" }}>{subjectName}</div>
            <div style={{ fontSize: 13, color: "#64748b" }}>{topicName}</div>
            <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "rgba(34,197,94,0.1)", borderRadius: 6, fontSize: 12, color: "#22c55e", fontWeight: 600 }}>
              ✓ Passed
            </div>
          </div>

          {error && (
            <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, fontSize: 13, color: "#ef4444", marginBottom: 14 }}>
              {error}
            </div>
          )}

          {partners.length === 0 ? (
            /* No partners state */
            <div className="solo-card" style={{ textAlign: "center", padding: "40px 24px" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#e2e8f0", marginBottom: 8 }}>
                No partners available yet.
              </div>
              <div style={{ fontSize: 13, color: "#64748b", maxWidth: 300, margin: "0 auto 20px" }}>
                We'll notify you when someone reaches this checkpoint.
              </div>
              <div className="btn-row" style={{ justifyContent: "center" }}>
                <button className="btn-secondary" onClick={handleOpenSession} disabled={connecting === "open"}>
                  {connecting === "open" ? "Creating…" : "Create Open Session"}
                </button>
                <button className="btn-secondary" onClick={() => navigate("/app/solo")}>
                  Continue Learning
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600 }}>Available Partners</div>
                <div style={{ fontSize: 12, color: "#22c55e" }}>
                  {partners.length} student{partners.length !== 1 ? "s" : ""} ready
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {partners.map(p => (
                  <div key={p.id} className="partner-card">
                    <PeerAvatar name={p.displayName} photo={p.photoURL} />
                    <div className="partner-card-info">
                      <div className="partner-card-name">{p.displayName}</div>
                      <div className="partner-card-meta">
                        {p.grade && `${p.grade} · `}
                        <span className="partner-card-badge">✓ Same checkpoint</span>
                        {p.checkpointPassedAt && (
                          <span style={{ marginLeft: 8, color: "#334155" }}>
                            {timeAgo(p.checkpointPassedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      className="connect-btn"
                      onClick={() => handleConnect(p.id)}
                      disabled={connecting === p.id}
                    >
                      {connecting === p.id ? "Connecting…" : "Connect"}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right — no partner fallback */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="solo-card-sm">
            <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600, marginBottom: 8 }}>Can't find anyone?</div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>
              We'll notify you when someone reaches this checkpoint.
            </div>
            <button className="btn-secondary" style={{ width: "100%", justifyContent: "center" }}>
              Notify Me
            </button>
            <div style={{ marginTop: 10 }}>
              <button
                className="btn-secondary"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => navigate("/app/solo")}
              >
                Continue Learning
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
