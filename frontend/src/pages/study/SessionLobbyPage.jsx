/**
 * SessionLobbyPage — /app/study-rooms/lobby/:sessionId
 * Creator waits for partner. Polls every 3 seconds.
 * When partner joins (status=active), shows "Start Learning" button.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import * as api from "../../api";
import { fmtDuration, estimateDuration } from "./sessionUtils";

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button className="ls-copy-btn" onClick={handleCopy} title="Copy code">
      {copied ? "✓ Copied!" : "Copy Code"}
    </button>
  );
}

function Participant({ label, user, status, isWaiting }) {
  const name = user?.name || user?.displayName || label;
  const photo = user?.photoUrl || user?.photoURL || "";
  const initial = name.charAt(0).toUpperCase();
  return (
    <div className="ls-participant">
      {photo
        ? <img src={photo} alt={name} className="ls-participant-avatar" referrerPolicy="no-referrer" />
        : <div className="ls-participant-avatar ls-participant-avatar-fallback">{initial}</div>
      }
      <div className="ls-participant-info">
        <span className="ls-participant-name">{name}</span>
        <span className={`ls-participant-status ${isWaiting ? "waiting" : "joined"}`}>
          {isWaiting ? (
            <><span className="ls-dot-anim" />Waiting...</>
          ) : (
            <><span className="ls-dot-green" />Joined</>
          )}
        </span>
      </div>
    </div>
  );
}

export default function SessionLobbyPage() {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const intervalRef = useRef(null);

  async function loadSession() {
    try {
      const data = await api.getLearningSession(Number(sessionId));
      setSession(data);
      // If partner has joined, stop polling
      if (data.status === "active") {
        clearInterval(intervalRef.current);
      }
    } catch (e) {
      setError(e.message);
      clearInterval(intervalRef.current);
    }
  }

  useEffect(() => {
    loadSession();
    intervalRef.current = setInterval(loadSession, 3000);
    return () => clearInterval(intervalRef.current);
  }, [sessionId]);

  function handleStart() {
    navigate(`/app/study-rooms/session/${sessionId}`);
  }

  if (error) return (
    <div className="ls-page ls-page-centered">
      <div className="ls-error-card">
        <p className="ls-error-text">⚠️ {error}</p>
        <button className="ls-btn-ghost" onClick={() => navigate("/app/study-rooms/start")}>← Back</button>
      </div>
    </div>
  );

  if (!session) return (
    <div className="ls-page ls-page-centered">
      <div className="ls-loading-spinner" aria-label="Loading" />
    </div>
  );

  const topic = session.topic || {};
  const creator = session.creator || { name: user?.displayName || "You" };
  const partner = session.partner || null;
  const partnerJoined = !!partner && session.status === "active";
  const duration = fmtDuration(topic.estimatedMinutes ?? estimateDuration(topic.activitiesCount));
  const code = session.sessionCode || "—";

  return (
    <div className="ls-page">
      {/* Top session banner */}
      <div className="ls-lobby-header">
        <div className="ls-lobby-topic-info">
          <span className="ls-lobby-topic-icon">{topic.subjectIcon || "📚"}</span>
          <div>
            <h1 className="ls-lobby-topic-name">{topic.name}</h1>
            <div className="ls-lobby-meta">
              <span className="ls-tag">{topic.subject}</span>
              {duration && <span className="ls-tag">⏱ {duration}</span>}
              <span className="ls-badge-active">Session Active</span>
            </div>
          </div>
        </div>
        <div className="ls-session-code-box">
          <p className="ls-code-label">Session Code</p>
          <div className="ls-code-display">
            <span className="ls-code-text">{code}</span>
            <CopyButton text={code} />
          </div>
        </div>
      </div>

      <div className="ls-lobby-body">
        {/* Waiting room */}
        <div className="ls-lobby-waiting">
          {partnerJoined ? (
            <div className="ls-lobby-partner-joined">
              <div className="ls-partner-joined-icon">✓</div>
              <p className="ls-lobby-ready-title">Your partner has joined!</p>
              <p className="ls-lobby-ready-sub">You can now start the learning session.</p>
            </div>
          ) : (
            <div className="ls-lobby-waiting-inner">
              <div className="ls-waiting-spinner" />
              <p className="ls-lobby-wait-title">Waiting for your partner…</p>
              <p className="ls-lobby-wait-sub">Once they join, you'll be able to start the learning session.</p>
            </div>
          )}

          {/* Participant slots */}
          <div className="ls-participants-row">
            <div className="ls-participants-label">Waiting Room</div>
            <div className="ls-participants">
              <Participant label="You" user={creator} status="joined" isWaiting={false} />
              <div className="ls-participants-vs">vs</div>
              <Participant
                label="Partner"
                user={partnerJoined ? partner : null}
                status={partnerJoined ? "joined" : "waiting"}
                isWaiting={!partnerJoined}
              />
            </div>
          </div>

          {partnerJoined && (
            <button className="ls-btn-primary ls-lobby-start-btn" onClick={handleStart}>
              Start Learning Session →
            </button>
          )}
        </div>

        {/* Session details panel */}
        <div className="ls-lobby-details">
          <h3 className="ls-lobby-details-title">Session Details</h3>
          <dl className="ls-lobby-dl">
            <dt>Subject</dt>     <dd>{topic.subject || "—"}</dd>
            <dt>Topic</dt>       <dd>{topic.name || "—"}</dd>
            <dt>Duration</dt>    <dd>{duration}</dd>
            <dt>Content</dt>
            <dd>
              {topic.objectivesCount ?? 0} Objectives ·{" "}
              {topic.conceptsCount ?? 0} Concepts ·{" "}
              {topic.misconceptionsCount ?? 0} Misconceptions ·{" "}
              {topic.activitiesCount ?? 0} Activities ·{" "}
              {topic.questionsCount ?? 0} Questions ·{" "}
              {topic.resourcesCount ?? 0} Resources
            </dd>
          </dl>
          <button
            className="ls-btn-ghost ls-btn-sm ls-lobby-back-btn"
            onClick={() => navigate("/app/study-rooms/start")}
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
