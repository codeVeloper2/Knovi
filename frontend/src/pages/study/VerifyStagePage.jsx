/**
 * VerifyStagePage — /app/study-rooms/session/:sessionId/verify
 * Two sub-states: loading (AI checking) → result (correct | incorrect)
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import * as api from "../../api";
import { pickActivity } from "./sessionUtils";
import StageBar from "./StageBar";

const CHECKLIST = [
  "Checking for correct concepts…",
  "Looking for key terms (force, mass, acceleration)…",
  "Comparing with common misconceptions…",
  "Evaluating explanation quality…",
];

function LoadingState({ attempt }) {
  const [visible, setVisible] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setVisible((v) => Math.min(v + 1, CHECKLIST.length)), 800);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="ls-verify-loading">
      <div className="ls-verify-robot">🤖</div>
      <h2 className="ls-verify-title">AI Verification</h2>
      <p className="ls-verify-sub">Your explanation is being checked…</p>
      {attempt > 1 && <p className="ls-verify-attempt">{attempt}/3 attempts</p>}
      <ul className="ls-verify-checklist">
        {CHECKLIST.map((item, i) => (
          <li key={i} className={`ls-verify-item ${i < visible ? "visible" : ""}`}
              style={{ animationDelay: `${i * 0.8}s` }}>
            <span className="ls-verify-check">{i < visible ? "✓" : "○"}</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CorrectResult({ result, userName, navigate, sessionId }) {
  const bullets = result.feedback
    ? result.feedback.split(".").filter((s) => s.trim().length > 10).slice(0, 3)
    : [];

  return (
    <div className="ls-verify-result ls-verify-correct">
      <div className="ls-verify-result-icon ls-verify-correct-icon">✓</div>
      <h2 className="ls-verify-result-title">Great job, {userName}!</h2>
      <p className="ls-verify-result-sub">
        Your explanation demonstrates a good understanding of the concept.
      </p>
      {bullets.length > 0 && (
        <div className="ls-verify-well">
          <h4>What you did well</h4>
          <ul>
            {bullets.map((b, i) => (
              <li key={i}><span className="ls-verify-check">✓</span> {b.trim()}.</li>
            ))}
          </ul>
        </div>
      )}
      {result.feedback && (
        <div className="ls-verify-feedback-card">
          <div className="ls-verify-feedback-label">
            <span>🤖</span> Quick Feedback
          </div>
          <p>{result.feedback}</p>
        </div>
      )}
      <button
        className="ls-btn-primary ls-verify-continue-btn"
        onClick={() => navigate(`/app/study-rooms/session/${sessionId}/practice`)}
      >
        Continue →
      </button>
    </div>
  );
}

function IncorrectResult({ result, onRetry, attempt, navigate, sessionId }) {
  const canRetry = attempt < 3;
  return (
    <div className="ls-verify-result ls-verify-incorrect">
      <div className="ls-verify-result-icon ls-verify-incorrect-icon">⚠</div>
      <h2 className="ls-verify-result-title">You're close. An important part is missing.</h2>
      <p className="ls-verify-result-sub">{result.feedback}</p>
      {result.misconception_detected && (
        <div className="ls-verify-misconception">
          <h4>Misconception detected</h4>
          <p>"{result.misconception_detected}"</p>
        </div>
      )}
      {result.hint && (
        <div className="ls-hint-box">
          <span className="ls-hint-icon">💡</span>
          <p>{result.hint}</p>
        </div>
      )}
      <div className="ls-verify-actions">
        {canRetry && (
          <button className="ls-btn-primary" onClick={onRetry}>Try Again</button>
        )}
        <button
          className="ls-btn-ghost"
          onClick={() => navigate(`/app/study-rooms/session/${sessionId}/practice`)}
        >
          Continue anyway
        </button>
      </div>
    </div>
  );
}

export default function VerifyStagePage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(1);
  const calledRef = useRef(false);

  const { response, activityId } = location.state || {};

  useEffect(() => {
    if (!response || !activityId || calledRef.current) return;
    calledRef.current = true;
    api.submitActivityResponse(Number(sessionId), activityId, { response })
      .then((r) => setResult(r))
      .catch(() => {
        // On network error, show graceful fallback
        setResult({ isCorrect: true, score: 70, aiFeedback: "Could not verify — please ask your study partner to review.", hint: null });
      });
  }, [sessionId, response, activityId]);

  function handleRetry() {
    setResult(null);
    setAttempt((a) => a + 1);
    calledRef.current = false;
    navigate(`/app/study-rooms/session/${sessionId}/explain`, {
      state: { attempt: attempt + 1 },
    });
  }

  const userName = user?.displayName?.split(" ")?.[0] || "there";

  return (
    <div className="ls-stage-page">
      <StageBar current="verify" sessionId={sessionId} />

      <div className="ls-verify-page">
        {!result ? (
          <LoadingState attempt={attempt} />
        ) : result.isCorrect ? (
          <CorrectResult result={result} userName={userName} navigate={navigate} sessionId={sessionId} />
        ) : (
          <IncorrectResult result={result} onRetry={handleRetry} attempt={attempt} navigate={navigate} sessionId={sessionId} />
        )}
      </div>
    </div>
  );
}
