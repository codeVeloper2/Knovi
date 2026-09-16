/**
 * ChallengeLobbyPage — /app/challenge/lobby/:sessionId
 *
 * Both participants confirm ready. When both ready → advance to questions.
 * Handles: partner leaves, timeout, refresh, disconnect.
 * Partner disconnect does NOT fail the student — session is cancelled cleanly.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";

const POLL_MS     = 3000;
const HB_MS       = 20000;

const IconCheck = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="m5 12 5 5L20 7" />
  </svg>
);

const IconSpinner = () => (
  <svg className="ch-spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" opacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" />
  </svg>
);

function Avatar({ name, size = 52 }) {
  const letter = (name || "?")[0].toUpperCase();
  return (
    <div className="ch-avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {letter}
    </div>
  );
}

export default function ChallengeLobbyPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [error, setError]     = useState(null);

  const pollRef = useRef(null);
  const hbRef   = useRef(null);

  const loadSession = useCallback(async () => {
    try {
      const data = await api.challengeGet(sessionId);
      setSession(data.session);
      return data.session;
    } catch (err) {
      setError(err.message || "Could not load session.");
      return null;
    }
  }, [sessionId]);

  useEffect(() => {
    loadSession().finally(() => setLoading(false));

    // Heartbeat
    hbRef.current = setInterval(() => {
      api.challengeHeartbeat(sessionId).catch(() => {});
    }, HB_MS);

    // Poll for state changes
    pollRef.current = setInterval(async () => {
      const sess = await loadSession();
      if (!sess) return;
      if (sess.status === "questions") {
        clearInterval(pollRef.current);
        navigate(`/app/challenge/session/${sessionId}`, { replace: true });
      }
      if (sess.status === "cancelled") {
        clearInterval(pollRef.current);
        setError("Your partner left the lobby. Session cancelled.");
      }
    }, POLL_MS);

    return () => {
      clearInterval(pollRef.current);
      clearInterval(hbRef.current);
    };
  }, [sessionId, loadSession, navigate]);

  async function handleReady() {
    setMarking(true);
    setError(null);
    try {
      const data = await api.challengeReady(sessionId);
      setSession(data.session);
      if (data.session.status === "questions") {
        navigate(`/app/challenge/session/${sessionId}`, { replace: true });
      }
    } catch (err) {
      setError(err.message || "Could not mark ready.");
    } finally {
      setMarking(false);
    }
  }

  async function handleCancel() {
    clearInterval(pollRef.current);
    clearInterval(hbRef.current);
    try { await api.challengeCancel(sessionId); } catch (_) { /* ignore */ }
    navigate(-1);
  }

  if (loading) {
    return (
      <div className="ch-lobby-page">
        <div className="ch-lobby-card">
          <IconSpinner />
          <p>Loading lobby…</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="ch-lobby-page">
        <div className="ch-lobby-card">
          <p className="ch-error-text">{error || "Session not found."}</p>
          <button className="ch-btn-secondary" onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    );
  }

  const myRole       = session.myRole;
  const isInitiator  = myRole === "initiator";
  const myReady      = isInitiator ? session.initiatorReady : session.partnerReady;
  const partnerReady = isInitiator ? session.partnerReady   : session.initiatorReady;
  const partner      = isInitiator ? session.partner        : session.initiator;
  const hasPartner   = !!session.partnerId;

  const STATUS_STEPS = [
    { label: "Lesson",          done: true },
    { label: "Checkpoint",      done: true },
    { label: "Explain It",      done: true },
    { label: "AI Verification", done: true },
    { label: "Challenge",       done: false, active: true },
  ];

  return (
    <div className="ch-lobby-page">
      <div className="ch-lobby-layout">
        {/* Main card */}
        <div className="ch-lobby-card">
          <div className="ch-lobby-header">
            <h2 className="ch-lobby-title">Challenge Lobby</h2>
            <p className="ch-lobby-sub">
              {hasPartner
                ? "Both players need to confirm ready before the Challenge begins."
                : "Waiting for your partner to join…"}
            </p>
          </div>

          {/* Concept name */}
          {session.conceptId && (
            <div className="ch-lobby-concept">
              Concept #{session.conceptId}
            </div>
          )}

          {/* Participants */}
          <div className="ch-lobby-participants">
            {/* Me */}
            <div className={`ch-participant ${myReady ? "ch-participant-ready" : ""}`}>
              <Avatar name="You" />
              <div className="ch-participant-name">You</div>
              <div className={`ch-participant-status ${myReady ? "ch-status-ready" : ""}`}>
                {myReady ? <><IconCheck /> Ready</> : "Not ready"}
              </div>
            </div>

            <div className="ch-vs">VS</div>

            {/* Partner */}
            {hasPartner ? (
              <div className={`ch-participant ${partnerReady ? "ch-participant-ready" : ""}`}>
                <Avatar name={partner?.displayName || "Partner"} />
                <div className="ch-participant-name">{partner?.displayName || "Partner"}</div>
                <div className={`ch-participant-status ${partnerReady ? "ch-status-ready" : ""}`}>
                  {partnerReady ? <><IconCheck /> Ready</> : <><IconSpinner /> Waiting…</>}
                </div>
              </div>
            ) : (
              <div className="ch-participant ch-participant-empty">
                <div className="ch-avatar ch-avatar-empty" style={{ width: 52, height: 52, fontSize: 20 }}>?</div>
                <div className="ch-participant-name">Partner</div>
                <div className="ch-participant-status"><IconSpinner /> Joining…</div>
              </div>
            )}
          </div>

          {error && (
            <div className="ch-error-banner">{error}</div>
          )}

          {/* Actions */}
          <div className="ch-lobby-actions">
            {session.status === "cancelled" ? (
              <button className="ch-btn-secondary" onClick={() => navigate(-1)}>
                Back to Learning
              </button>
            ) : !myReady ? (
              <button
                className="ch-btn-primary"
                onClick={handleReady}
                disabled={!hasPartner || marking}
              >
                {marking
                  ? <><IconSpinner /> Confirming…</>
                  : hasPartner
                    ? "I'm Ready →"
                    : "Waiting for partner…"
                }
              </button>
            ) : (
              <div className="ch-both-ready-msg">
                {partnerReady
                  ? <><IconSpinner /> Starting Challenge…</>
                  : <><IconSpinner /> Waiting for partner to confirm…</>
                }
              </div>
            )}

            <button className="ch-btn-ghost" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>

        {/* Side panel: what to expect */}
        <div className="ch-lobby-side">
          <div className="ch-side-card">
            <div className="ch-side-title">What happens next</div>
            <div className="ch-side-steps">
              <div className="ch-side-step">
                <span className="ch-side-step-num">1</span>
                <div>
                  <div className="ch-side-step-label">5 Questions</div>
                  <div className="ch-side-step-desc">Both answer independently — no peeking</div>
                </div>
              </div>
              <div className="ch-side-step">
                <span className="ch-side-step-num">2</span>
                <div>
                  <div className="ch-side-step-label">Peer Exchange</div>
                  <div className="ch-side-step-desc">You ask your partner a question, they ask you one</div>
                </div>
              </div>
              <div className="ch-side-step">
                <span className="ch-side-step-num">3</span>
                <div>
                  <div className="ch-side-step-label">AI Evaluation</div>
                  <div className="ch-side-step-desc">AI reviews all evidence and decides pass/fail</div>
                </div>
              </div>
            </div>
          </div>

          <div className="ch-side-card ch-side-prereqs">
            <div className="ch-side-title">Your completed stages</div>
            {STATUS_STEPS.map((s, i) => (
              <div key={i} className={`ch-prereq-row ${s.done ? "done" : ""} ${s.active ? "active" : ""}`}>
                <span className="ch-prereq-icon">{s.done ? <IconCheck /> : "○"}</span>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
