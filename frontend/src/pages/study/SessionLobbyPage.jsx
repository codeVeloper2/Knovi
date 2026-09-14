/**
 * SessionLobbyPage — /app/rooms/lobby/:sessionId
 * Creator waits here. Polls every 3 seconds.
 * When partner joins (status = "active") → navigate to setup page.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import * as api from "../../api";

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button className="pt-copy-btn" onClick={copy}>{copied ? "✓ Copied!" : "Copy Code"}</button>
  );
}

function fmtDuration(mins) {
  if (!mins) return "—";
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60 ? `${mins % 60}m` : ""}`.trim();
}

function Participant({ label, user, joined }) {
  const name    = user?.name || label;
  const photo   = user?.photoUrl || "";
  const initial = name.charAt(0).toUpperCase();
  return (
    <div className="pt-participant">
      {photo
        ? <img src={photo} alt={name} className="pt-p-avatar" referrerPolicy="no-referrer" />
        : <div className="pt-p-avatar pt-p-avatar-fb">{initial}</div>
      }
      <span className="pt-p-name">{name}</span>
      <span className={`pt-p-status ${joined ? "joined" : "waiting"}`}>
        {joined
          ? <><span className="pt-dot-green"/>Joined</>
          : <><span className="pt-dot-anim"/>Joining…</>
        }
      </span>
    </div>
  );
}

export default function SessionLobbyPage() {
  const { sessionId } = useParams();
  const { user }      = useAuth();
  const navigate      = useNavigate();
  const [session, setSession] = useState(null);
  const [error,   setError]   = useState("");
  const intervalRef = useRef(null);

  async function load() {
    try {
      const data = await api.getLearningSession(Number(sessionId));
      setSession(data);
      if (data.status === "active") {
        clearInterval(intervalRef.current);
        navigate(`/app/rooms/setup/${sessionId}`);
      }
    } catch (e) {
      setError(e.message);
      clearInterval(intervalRef.current);
    }
  }

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 3000);
    return () => clearInterval(intervalRef.current);
  }, [sessionId]);

  if (error) return (
    <div className="pt-page pt-page-centered">
      <div className="pt-error-card"><p className="pt-err-text">⚠️ {error}</p>
        <button className="pt-btn-ghost" onClick={() => navigate("/app/rooms")}>← Back</button>
      </div>
    </div>
  );
  if (!session) return <div className="pt-page pt-page-centered"><div className="pt-spinner" /></div>;

  const topic   = session.topic   || {};
  const teacher = session.teacher || {};
  const learner = session.learner || {};
  const code    = session.sessionCode || "—";
  const duration = fmtDuration(topic.estimatedMinutes ?? (topic.conceptsCount * 8 + topic.questionsCount * 3));
  const partnerJoined = session.status === "active";
  const isTeacher = user?.uid === String(session.teacherId);

  return (
    <div className="pt-page">
      {/* Header banner */}
      <div className="pt-lobby-header">
        <div className="pt-lobby-topic">
          <span className="pt-lobby-topic-icon">{topic.subjectIcon || "📚"}</span>
          <div>
            <h1 className="pt-lobby-topic-name">{topic.name}</h1>
            <div className="pt-lobby-meta">
              <span className="pt-tag">{topic.subject}</span>
              {duration && <span className="pt-tag">⏱ {duration}</span>}
              <span className="pt-badge-active">Session Active</span>
            </div>
          </div>
        </div>

        {/* Session code */}
        <div className="pt-code-box">
          <p className="pt-code-label">Session Code</p>
          <div className="pt-code-display">
            <span className="pt-code-text">{code}</span>
            <CopyBtn text={code} />
          </div>
        </div>
      </div>

      {/* Created success state */}
      {!partnerJoined && (
        <div className="pt-lobby-created-banner">
          <div className="pt-created-check">✓</div>
          <div>
            <p className="pt-created-title">Session Created!</p>
            <p className="pt-created-sub">Your learning session has been set up. Share the code with your study partner to join.</p>
          </div>
        </div>
      )}

      <div className="pt-lobby-body">
        {/* Waiting room */}
        <div className="pt-lobby-waiting">
          <h3 className="pt-lobby-section-title">Waiting Room</h3>
          <div className="pt-participants">
            <Participant label="You"     user={teacher} joined={true} />
            <div className="pt-participants-vs">vs</div>
            <Participant label="Partner" user={partnerJoined ? learner : null} joined={partnerJoined} />
          </div>

          {!partnerJoined ? (
            <div className="pt-waiting-hint">
              <div className="pt-waiting-spinner" />
              <p>Waiting for your partner to join…</p>
              <p className="pt-waiting-sub">Your partner can enter this code on the Join Session page.</p>
            </div>
          ) : (
            <div className="pt-partner-ready">
              <p className="pt-partner-ready-text">🎉 Your partner has joined! Ready to start.</p>
              <button
                className="pt-btn-primary"
                onClick={() => navigate(`/app/rooms/setup/${sessionId}`)}
              >
                Start Learning Session →
              </button>
            </div>
          )}
        </div>

        {/* Session details */}
        <div className="pt-lobby-details">
          <h3 className="pt-lobby-section-title">Session Details</h3>
          <dl className="pt-dl">
            <dt>Subject</dt>   <dd>{topic.subject || "—"}</dd>
            <dt>Topic</dt>     <dd>{topic.name || "—"}</dd>
            <dt>Duration</dt>  <dd>{duration}</dd>
            <dt>Content</dt>
            <dd>
              {topic.objectivesCount ?? 0} Objectives ·{" "}
              {topic.conceptsCount ?? 0} Concepts ·{" "}
              {topic.misconceptionsCount ?? 0} Misconceptions ·{" "}
              {topic.activitiesCount ?? 0} Activities ·{" "}
              {topic.questionsCount ?? 0} Questions ·{" "}
              {topic.resourcesCount ?? 0} Resources
            </dd>
            <dt>Session Flow</dt>
            <dd className="pt-flow-list">
              <span className="pt-flow-item">Concepts Phase</span>
              <span className="pt-flow-item">Practice Phase</span>
              <span className="pt-flow-item">Challenge Phase</span>
              <span className="pt-flow-item">Summary</span>
            </dd>
          </dl>
          <button className="pt-btn-ghost pt-btn-sm" style={{ marginTop: 16 }} onClick={() => navigate("/app/rooms")}>
            ← Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
