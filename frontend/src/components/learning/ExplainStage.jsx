/**
 * ExplainStage — Student explains the concept in their own words.
 * AI evaluates conceptual understanding (not grammar/spelling).
 * Shows AI feedback inline; handles AI unavailable gracefully.
 */
import { useState, useEffect } from "react";
import * as api from "../../api";

function IconSpinner() {
  return (
    <svg className="ls-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}
function IconBot() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" /><path d="M12 7v4" />
    </svg>
  );
}

export default function ExplainStage({ conceptId, progress, onComplete }) {
  const [explanation, setExplanation] = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState(null);
  const [feedback, setFeedback]       = useState(null);  // AI result
  const [aiUnavailable, setAiUnavailable] = useState(false);

  // Pre-fill from last attempt if any
  useEffect(() => {
    const attempts = progress?.explanationAttempts || [];
    if (attempts.length > 0) {
      const last = attempts[attempts.length - 1];
      if (last.explanation) setExplanation(last.explanation);
      if (last.aiResult?.result) setFeedback(last.aiResult.result);
    }
  }, [progress]);

  const charCount = explanation.trim().length;
  const tooShort = charCount < 50;

  const handleSubmit = async () => {
    if (tooShort) return;
    try {
      setSubmitting(true);
      setError(null);
      setFeedback(null);
      setAiUnavailable(false);

      const res = await api.conceptSubmitExplanation(conceptId, { explanation: explanation.trim() });

      if (res.aiUnavailable) {
        setAiUnavailable(true);
        return;
      }

      if (res.passed) {
        if (onComplete) await onComplete();
        return;
      }

      // Not passed — show AI feedback
      if (res.aiResult) {
        setFeedback(res.aiResult);
      }
    } catch (err) {
      setError(err.message || "Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ex-stage">
      {/* Header */}
      <div className="ex-header">
        <div className="ex-header-icon">💭</div>
        <div>
          <h2 className="ex-title">Explain It In Your Own Words</h2>
          <p className="ex-subtitle">
            Show that you understand this concept by explaining it simply.
            Don't worry about perfect wording — focus on demonstrating understanding.
          </p>
        </div>
      </div>

      {/* AI Unavailable banner */}
      {aiUnavailable && (
        <div className="ex-unavail-banner">
          <div className="ex-unavail-icon">⚠</div>
          <div>
            <p><strong>AI verification is temporarily unavailable.</strong></p>
            <p>Your response has been saved. You can try again or continue.</p>
          </div>
          <div className="ex-unavail-actions">
            <button className="ls-btn-ghost" onClick={handleSubmit} disabled={submitting || tooShort}>
              Try Again
            </button>
            <button className="ls-btn-primary" onClick={() => onComplete && onComplete()}>
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Feedback panel */}
      {feedback && !aiUnavailable && (
        <div className={`ex-feedback ex-feedback-${feedback.verdict}`}>
          <div className="ex-feedback-header">
            <IconBot />
            <span className="ex-feedback-label">AI Verification</span>
            <span className={`ex-verdict-badge ex-verdict-${feedback.verdict}`}>
              {feedback.verdict === "correct" ? "✓ Understanding Demonstrated" :
               feedback.verdict === "partial"  ? "◐ Partially There" :
                                                 "✗ Needs More Detail"}
            </span>
          </div>
          <p className="ex-feedback-text">{feedback.feedback}</p>
          {feedback.correct_points?.length > 0 && (
            <div className="ex-points ex-points-good">
              <div className="ex-points-label">✓ What you got right</div>
              <ul>{feedback.correct_points.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </div>
          )}
          {feedback.missing_points?.length > 0 && (
            <div className="ex-points ex-points-miss">
              <div className="ex-points-label">◉ What's missing</div>
              <ul>{feedback.missing_points.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </div>
          )}
          {feedback.hint && (
            <div className="ex-hint">
              <strong>Hint:</strong> {feedback.hint}
            </div>
          )}
        </div>
      )}

      {/* Text area */}
      <div className="ex-input-area">
        <label className="ex-input-label" htmlFor="explain-input">
          Your Explanation
        </label>
        <textarea
          id="explain-input"
          className="ex-textarea"
          value={explanation}
          onChange={e => setExplanation(e.target.value)}
          placeholder="Explain the concept as if you're teaching it to a friend…"
          rows={8}
          disabled={submitting}
        />
        <div className="ex-char-row">
          <span className={`ex-char-count ${tooShort ? "ex-char-short" : "ex-char-ok"}`}>
            {charCount} characters{tooShort ? ` (aim for at least 50)` : ""}
          </span>
        </div>
      </div>

      {error && <div className="ls-error"><p>{error}</p></div>}

      {/* Submit */}
      <div className="ex-actions">
        <button
          className="ls-btn-primary ls-btn-large"
          onClick={handleSubmit}
          disabled={submitting || tooShort}
        >
          {submitting
            ? <><IconSpinner /> Checking your explanation…</>
            : feedback
            ? <><IconBot /> Resubmit Explanation</>
            : "Submit for AI Review"}
        </button>
      </div>

      {/* Note */}
      <p className="ex-note">
        The AI evaluates <em>conceptual understanding</em>, not grammar or writing style.
      </p>
    </div>
  );
}
