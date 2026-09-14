/**
 * JoinSessionPage — /app/study-rooms/join
 * Three states: EnterCode → (Invalid | SessionFound)
 */
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import * as api from "../../api";
import { fmtDuration } from "./sessionUtils";

// ── State A: enter code ───────────────────────────────────────────────────────
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
    <div className="ls-join-card">
      <div className="ls-join-icon-wrap ls-join-icon-neutral">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/>
          <path d="M14 14h.01M14 18h.01M18 14h.01M18 18h.01"/>
        </svg>
      </div>
      <h1 className="ls-join-title">Join a Learning Session</h1>
      <p className="ls-join-sub">Enter the session code your study partner gave you.</p>

      <form onSubmit={handleSubmit} className="ls-join-form">
        <div className="ls-code-input-wrap">
          <span className="ls-code-prefix-icon">🔑</span>
          <input
            className="ls-code-input"
            placeholder="e.g. NLM-4827"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={8}
            autoFocus
          />
        </div>
        <button className="ls-btn-primary ls-join-btn" type="submit" disabled={busy || !code.trim()}>
          {busy ? "Checking…" : "Join Session →"}
        </button>
      </form>

      <p className="ls-join-hint">
        <span className="ls-hint-icon">ℹ️</span>
        Session codes are shared by your study partner after they create a session.
      </p>

      <p className="ls-join-discover">
        Don't have a code?{" "}
        <Link to="/app/discover" className="ls-link">Find a study partner →</Link>
      </p>
    </div>
  );
}

// ── State B: invalid code ─────────────────────────────────────────────────────
function InvalidCode({ code, message, onRetry }) {
  const navigate = useNavigate();
  return (
    <div className="ls-join-card">
      <div className="ls-join-icon-wrap ls-join-icon-error">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>
        </svg>
      </div>
      <h1 className="ls-join-title">Invalid Session Code</h1>
      <p className="ls-join-sub">
        {message || "The code you entered doesn't match any active or available session. Please check and try again."}
      </p>
      <div className="ls-code-display ls-code-display-error">
        <span className="ls-code-prefix-icon">🔑</span>
        <span className="ls-code-text-sm">{code}</span>
      </div>
      <div className="ls-join-actions">
        <button className="ls-btn-primary ls-join-btn" onClick={onRetry}>Try Again</button>
        <button className="ls-btn-ghost ls-join-btn" onClick={() => navigate("/app")}>
          🏠 Back to Home
        </button>
      </div>
    </div>
  );
}

// ── State C: session found ────────────────────────────────────────────────────
function SessionFound({ data, onBack }) {
  const navigate = useNavigate();
  const [joining, setJoining] = useState(false);
  const [err, setErr] = useState("");

  const topic = data.topic || {};
  const creator = data.creator || {};
  const duration = fmtDuration(topic.estimatedMinutes);

  async function handleJoin() {
    setJoining(true); setErr("");
    try {
      const sess = await api.joinLearningSession(data.id);
      navigate(`/app/study-rooms/session/${sess.id}`);
    } catch (e) {
      setErr(e.message);
      setJoining(false);
    }
  }

  return (
    <div className="ls-join-card">
      <div className="ls-join-icon-wrap ls-join-icon-success">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>
        </svg>
      </div>
      <h1 className="ls-join-title">Session Found!</h1>
      <p className="ls-join-sub">You're about to join a learning session.</p>

      {/* Topic card */}
      <div className="ls-found-topic-card">
        <div className="ls-found-topic-icon">{topic.subjectIcon || "📚"}</div>
        <div className="ls-found-topic-info">
          <p className="ls-found-topic-name">{topic.name}</p>
          <p className="ls-found-topic-meta">
            {topic.subject} {duration && <span>· ⏱ {duration}</span>}
          </p>
          {creator.name && (
            <p className="ls-found-topic-host">
              {creator.photoUrl
                ? <img src={creator.photoUrl} alt={creator.name} className="ls-found-host-avatar" referrerPolicy="no-referrer" />
                : <span className="ls-found-host-initial">{creator.name.charAt(0)}</span>
              }
              Hosted by {creator.name}
            </p>
          )}
        </div>
      </div>

      {/* Content counts */}
      <div className="ls-found-stats">
        <div className="ls-found-stat"><span className="ls-found-stat-val">{topic.objectivesCount ?? 0}</span><span className="ls-found-stat-lbl">Objectives</span></div>
        <div className="ls-found-stat"><span className="ls-found-stat-val">{topic.conceptsCount ?? 0}</span><span className="ls-found-stat-lbl">Concepts</span></div>
        <div className="ls-found-stat"><span className="ls-found-stat-val">{topic.misconceptionsCount ?? 0}</span><span className="ls-found-stat-lbl">Misconceptions</span></div>
        <div className="ls-found-stat"><span className="ls-found-stat-val">{topic.activitiesCount ?? 0}</span><span className="ls-found-stat-lbl">Activities</span></div>
        <div className="ls-found-stat"><span className="ls-found-stat-val">{topic.questionsCount ?? 0}</span><span className="ls-found-stat-lbl">Questions</span></div>
        <div className="ls-found-stat"><span className="ls-found-stat-val">{topic.resourcesCount ?? 0}</span><span className="ls-found-stat-lbl">Resources</span></div>
      </div>

      {err && <p className="ls-form-err">{err}</p>}

      <div className="ls-join-actions">
        <button className="ls-btn-primary ls-join-btn" onClick={handleJoin} disabled={joining}>
          {joining ? "Joining…" : "Join Learning Session →"}
        </button>
        <button className="ls-btn-ghost ls-join-btn" onClick={onBack}>Back</button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function JoinSessionPage() {
  const [view, setView] = useState("enter"); // "enter" | "invalid" | "found"
  const [invalidCode, setInvalidCode] = useState("");
  const [invalidMsg, setInvalidMsg]   = useState("");
  const [sessionData, setSessionData] = useState(null);

  function handleFound(data)             { setSessionData(data); setView("found"); }
  function handleInvalid(code, msg)      { setInvalidCode(code); setInvalidMsg(msg); setView("invalid"); }
  function handleRetry()                 { setView("enter"); }

  return (
    <div className="ls-page ls-page-centered">
      {view === "enter"   && <EnterCode onFound={handleFound} onInvalid={handleInvalid} />}
      {view === "invalid" && <InvalidCode code={invalidCode} message={invalidMsg} onRetry={handleRetry} />}
      {view === "found"   && <SessionFound data={sessionData} onBack={handleRetry} />}
    </div>
  );
}
