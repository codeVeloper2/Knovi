/**
 * JoinSessionPage — /app/rooms/join
 * Three states: EnterCode → (InvalidCode | SessionFound)
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as api from "../../api";

function fmtDuration(mins) {
  if (!mins) return "";
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60 ? `${mins % 60}m` : ""}`.trim();
}

// ── State A: Enter code ───────────────────────────────────────────────────────
function EnterCode({ onFound, onInvalid }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    try {
      const data = await api.validateSessionCode(code.trim().toUpperCase());
      onFound(data);
    } catch (err) {
      onInvalid(code.trim().toUpperCase(), err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pt-join-card">
      <div className="pt-join-icon pt-join-icon-neutral">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/>
          <path d="M14 14h.01M14 18h.01M18 14h.01M18 18h.01"/>
        </svg>
      </div>
      <h1 className="pt-join-title">Join a Learning Session</h1>
      <p className="pt-join-sub">Enter the session code your study partner gave you.</p>

      <form onSubmit={handleSubmit} className="pt-join-form">
        <div className="pt-code-input-wrap">
          <span className="pt-code-icon">🔑</span>
          <input
            className="pt-code-input"
            placeholder="e.g. NLM-4827"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            maxLength={8}
            autoFocus
          />
        </div>
        <button className="pt-btn-primary pt-join-btn" type="submit" disabled={busy || !code.trim()}>
          {busy ? "Checking…" : "Join Session →"}
        </button>
      </form>

      <p className="pt-join-hint">
        <span>ℹ️</span>
        Session codes are shared by your study partner after they create a session.
      </p>
      <p className="pt-join-discover">
        Don't have a code?{" "}
        <Link to="/app/discover" className="pt-link">Find a study partner →</Link>
      </p>
    </div>
  );
}

// ── State B: Invalid code ─────────────────────────────────────────────────────
function InvalidCode({ code, message, onRetry }) {
  const navigate = useNavigate();
  return (
    <div className="pt-join-card">
      <div className="pt-join-icon pt-join-icon-error">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>
        </svg>
      </div>
      <h1 className="pt-join-title">Invalid Session Code</h1>
      <p className="pt-join-sub">
        {message || "The code you entered doesn't match any active or available session. Please check and try again."}
      </p>
      <div className="pt-code-display pt-code-display-error">
        <span className="pt-code-icon">🔑</span>
        <span className="pt-code-text-error">{code}</span>
      </div>
      <div className="pt-join-actions">
        <button className="pt-btn-primary pt-join-btn" onClick={onRetry}>Try Again</button>
        <button className="pt-btn-ghost pt-join-btn" onClick={() => navigate("/app")}>🏠 Back to Home</button>
      </div>
    </div>
  );
}

// ── State C: Session found ────────────────────────────────────────────────────
function SessionFound({ data, onBack }) {
  const navigate = useNavigate();
  const [joining, setJoining] = useState(false);
  const [err, setErr]         = useState("");

  const topic   = data.topic   || {};
  const teacher = data.teacher || {};
  const learner = data.learner || {};
  const duration = fmtDuration(topic.estimatedMinutes);

  async function handleJoin() {
    setJoining(true); setErr("");
    try {
      await api.joinLearningSession(data.id);
      navigate(`/app/rooms/setup/${data.id}`);
    } catch (e) {
      setErr(e.message);
      setJoining(false);
    }
  }

  return (
    <div className="pt-join-card">
      <div className="pt-join-icon pt-join-icon-success">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>
        </svg>
      </div>
      <h1 className="pt-join-title">Session Found!</h1>
      <p className="pt-join-sub">You're about to join a learning session.</p>

      {/* Topic info */}
      <div className="pt-found-topic">
        <span className="pt-found-topic-icon">{topic.subjectIcon || "📚"}</span>
        <div>
          <p className="pt-found-topic-name">{topic.name}</p>
          <p className="pt-found-topic-meta">
            {topic.subject}{duration && ` · ⏱ ${duration}`}
          </p>
          {teacher.name && (
            <p className="pt-found-host">
              {teacher.photoUrl
                ? <img src={teacher.photoUrl} alt={teacher.name} className="pt-host-avatar" referrerPolicy="no-referrer" />
                : <span className="pt-host-initial">{teacher.name.charAt(0)}</span>
              }
              Hosted by {teacher.name}
            </p>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="pt-found-stats">
        {[
          ["Objectives",     topic.objectivesCount     ?? 0],
          ["Concepts",       topic.conceptsCount       ?? 0],
          ["Misconceptions", topic.misconceptionsCount  ?? 0],
          ["Activities",     topic.activitiesCount     ?? 0],
          ["Questions",      topic.questionsCount      ?? 0],
          ["Resources",      topic.resourcesCount      ?? 0],
        ].map(([lbl, val]) => (
          <div key={lbl} className="pt-found-stat">
            <span className="pt-found-stat-val">{val}</span>
            <span className="pt-found-stat-lbl">{lbl}</span>
          </div>
        ))}
      </div>

      {err && <p className="pt-form-err">{err}</p>}

      <div className="pt-join-actions">
        <button className="pt-btn-primary pt-join-btn" onClick={handleJoin} disabled={joining}>
          {joining ? "Joining…" : "Join Learning Session →"}
        </button>
        <button className="pt-btn-ghost pt-join-btn" onClick={onBack}>Back</button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function JoinSessionPage() {
  const [view,        setView]        = useState("enter");
  const [invalidCode, setInvalidCode] = useState("");
  const [invalidMsg,  setInvalidMsg]  = useState("");
  const [sessionData, setSessionData] = useState(null);

  return (
    <div className="pt-page pt-page-centered">
      {view === "enter"   && <EnterCode onFound={d => { setSessionData(d); setView("found"); }} onInvalid={(c, m) => { setInvalidCode(c); setInvalidMsg(m); setView("invalid"); }} />}
      {view === "invalid" && <InvalidCode code={invalidCode} message={invalidMsg} onRetry={() => setView("enter")} />}
      {view === "found"   && <SessionFound data={sessionData} onBack={() => setView("enter")} />}
    </div>
  );
}
