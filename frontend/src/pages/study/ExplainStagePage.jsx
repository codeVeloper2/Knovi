/**
 * ExplainStagePage — /app/study-rooms/session/:sessionId/explain
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";
import { pickActivity } from "./sessionUtils";
import StageBar from "./StageBar";

export default function ExplainStagePage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [text, setText] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getLearningSession(Number(sessionId))
      .then(setSession)
      .catch((e) => setError(e.message));
  }, [sessionId]);

  async function handleSubmit() {
    if (!text.trim()) return;
    const activity = pickActivity(session?.topic, "explain");
    if (!activity) {
      // No explain activity defined — skip to practice
      navigate(`/app/study-rooms/session/${sessionId}/practice`);
      return;
    }
    setSubmitting(true); setError("");
    try {
      await api.advanceSessionStage(Number(sessionId), "explain");
    } catch { /* ignore */ }
    // Navigate to verify page with the response stored in location state
    navigate(`/app/study-rooms/session/${sessionId}/verify`, {
      state: { response: text, activityId: activity.id },
    });
  }

  if (error) return <div className="ls-stage-error">⚠️ {error}</div>;
  if (!session) return <div className="ls-stage-loading"><div className="ls-loading-spinner" /></div>;

  const topic = session.topic || {};
  const activity = pickActivity(topic, "explain");
  const hint = activity?.metadata?.hint
    || topic.misconceptions?.[0]?.hint
    || null;

  return (
    <div className="ls-stage-page">
      <StageBar current="explain" sessionId={sessionId} />

      <div className="ls-stage-topbar">
        <button className="ls-btn-ghost ls-btn-sm" onClick={() => navigate(-1)}>← Back</button>
        <span className="ls-stage-topbar-info">10 min</span>
        <button className="ls-btn-ghost ls-btn-sm" onClick={() => navigate(`/app/study-rooms/session/${sessionId}/practice`)}>
          Mark as Complete
        </button>
      </div>

      <div className="ls-stage-layout ls-stage-layout-single">
        <div className="ls-stage-label">
          <span className="ls-stage-num">2</span>
          <div>
            <p className="ls-stage-type">Explain</p>
            <h2 className="ls-stage-title">{activity?.title || `Explain ${topic.name}`}</h2>
            <span className="ls-stage-mins">10 min</span>
          </div>
        </div>

        {/* Prompt box */}
        {activity?.prompt && (
          <div className="ls-explain-prompt-box">
            <p className="ls-explain-prompt-text">{activity.prompt}</p>
          </div>
        )}

        {/* Text area */}
        <textarea
          className="ls-explain-textarea"
          placeholder="Type your explanation here…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
        />

        {/* Hint */}
        <div className="ls-explain-actions-row">
          {hint && (
            <button className="ls-btn-ghost ls-btn-sm" onClick={() => setShowHint((s) => !s)}>
              💡 {showHint ? "Hide Hint" : "Need a Hint?"}
            </button>
          )}
          <button
            className="ls-btn-primary"
            onClick={handleSubmit}
            disabled={!text.trim() || submitting}
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </div>

        {showHint && hint && (
          <div className="ls-hint-box">
            <span className="ls-hint-icon">💡</span>
            <p>{hint}</p>
          </div>
        )}

        {error && <p className="ls-form-err">{error}</p>}
      </div>
    </div>
  );
}
