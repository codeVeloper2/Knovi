/**
 * CheckpointStage — 3-question MCQ checkpoint.
 *
 * Key fixes vs old version:
 *  - options are a plain object {A,B,C,D} — iterate with Object.entries()
 *  - checkpoint is loaded from backend (cached in DB) — no client-side passing back
 *  - submit only sends answers dict; backend uses its own cached checkpoint
 *  - polished UI: one question at a time, animated transitions
 */
import { useState, useEffect } from "react";
import * as api from "../../api";

// ─── Icons ────────────────────────────────────────────────────────────────────

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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}
function IconX() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="m18 6-12 12M6 6l12 12" />
    </svg>
  );
}
function IconArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

const OPTION_LABELS = ["A", "B", "C", "D"];

export default function CheckpointStage({ conceptId, progress, onComplete }) {
  const [loading, setLoading]           = useState(false);
  const [checkpoint, setCheckpoint]     = useState(null);
  const [currentQ, setCurrentQ]         = useState(0);
  const [answers, setAnswers]           = useState({});
  const [submitting, setSubmitting]     = useState(false);
  const [result, setResult]             = useState(null);
  const [reteaching, setReteaching]     = useState(null);
  const [loadingReteach, setLoadingReteach] = useState(false);
  const [error, setError]               = useState(null);

  // Load checkpoint from backend (uses cached checkpoint_data if available)
  useEffect(() => {
    // If already passed, show nothing (parent handles stage nav)
    if (progress?.checkpointPassed) return;

    // If we have cached checkpoint in progress, use it
    if (progress?.checkpointData) {
      setCheckpoint(progress.checkpointData);
      return;
    }
  }, [progress]);

  const handleGenerateCheckpoint = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.conceptGenerateCheckpoint(conceptId);
      if (!res.ok && !res.checkpoint) throw new Error(res.detail || "Failed to generate checkpoint");
      setCheckpoint(res.checkpoint);
      setCurrentQ(0);
      setAnswers({});
      setResult(null);
    } catch (err) {
      setError(err.message || "Checkpoint couldn't be generated. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAnswer = (letter) => {
    setAnswers(prev => ({ ...prev, [String(currentQ)]: letter }));
  };

  const handleNextQuestion = () => {
    const questions = checkpoint?.questions || [];
    if (currentQ < questions.length - 1) {
      setCurrentQ(i => i + 1);
    }
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError(null);
      const res = await api.conceptSubmitCheckpoint(conceptId, { answers });
      if (res.passed) {
        setResult(res);
        if (onComplete) await onComplete();
      } else {
        setResult(res);
      }
    } catch (err) {
      setError(err.message || "Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateReteaching = async () => {
    const missed = result?.missedKeyPoints || [];
    try {
      setLoadingReteach(true);
      setError(null);
      const res = await api.conceptGenerateReteaching(conceptId, { missedKeyPoints: missed });
      if (!res.ok && !res.reteaching) throw new Error(res.detail || "Failed to generate review");
      setReteaching(res.reteaching);
    } catch (err) {
      setError(err.message || "Couldn't generate review. Please try again.");
    } finally {
      setLoadingReteach(false);
    }
  };

  const handleRetry = async () => {
    setResult(null);
    setReteaching(null);
    setAnswers({});
    setCurrentQ(0);
    setCheckpoint(null);
    await handleGenerateCheckpoint();
  };

  // ── No checkpoint yet ──
  if (!checkpoint) {
    return (
      <div className="cp-stage">
        <div className="cp-intro">
          <div className="cp-intro-icon">✓</div>
          <h2 className="cp-intro-title">Ready for the Checkpoint?</h2>
          <p className="cp-intro-desc">
            Answer 3 questions to test what you understood from the lesson.
            Questions are based only on what you just learned.
          </p>
          {error && <div className="cp-error"><p>{error}</p></div>}
          <button className="ls-btn-primary ls-btn-large" onClick={handleGenerateCheckpoint} disabled={loading}>
            {loading ? <><IconSpinner /> Preparing Questions…</> : "Start Checkpoint"}
          </button>
        </div>
      </div>
    );
  }

  const questions = checkpoint.questions || [];
  const q = questions[currentQ];
  const totalQ = questions.length;
  const currentAnswer = answers[String(currentQ)];
  const allAnswered = questions.every((_, i) => answers[String(i)]);

  // ── Results screen ──
  if (result) {
    const { passed, score, results: qResults, missedKeyPoints } = result;

    // Show reteaching content if available
    if (!passed && reteaching) {
      const rBlocks = reteaching.blocks || [];
      return (
        <div className="cp-stage">
          <div className="cp-reteach-header">
            <div className="cp-reteach-badge">Re-learning</div>
            <h2>{reteaching.title || "Let's revisit this together"}</h2>
            <p>Focused on the areas you found difficult.</p>
          </div>
          <div className="cp-reteach-content">
            {/* Render reteaching blocks */}
            {rBlocks.length > 0 ? (
              rBlocks.map((block, i) => {
                const { LessonBlock } = require("./LessonBlocks");
                return <LessonBlock key={i} block={block} />;
              })
            ) : (
              // Fallback for old reteaching format
              <>
                {reteaching.introduction && <p className="cp-reteach-intro">{reteaching.introduction}</p>}
                {(reteaching.sections || []).map((s, i) => (
                  <div key={i} className="cp-reteach-section">
                    {s.heading && <h4>{s.heading}</h4>}
                    <p>{s.content}</p>
                  </div>
                ))}
              </>
            )}
          </div>
          {error && <div className="cp-error"><p>{error}</p></div>}
          <button className="ls-btn-primary ls-btn-large" onClick={handleRetry}>
            Try Checkpoint Again
          </button>
        </div>
      );
    }

    return (
      <div className="cp-stage">
        <div className={`cp-result-header ${passed ? "cp-result-pass" : "cp-result-fail"}`}>
          <div className="cp-result-icon">
            {passed ? <IconCheck /> : <IconX />}
          </div>
          <h2>{passed ? "Checkpoint Passed!" : "Not Quite There"}</h2>
          <div className="cp-result-score">{score}%</div>
          <p>{passed ? "Great work! Proceed to Explain It." : `You need ${checkpoint.passingScore || 67}% to pass.`}</p>
        </div>

        {/* Per-question breakdown */}
        <div className="cp-results-list">
          {(qResults || []).map((r, i) => (
            <div key={i} className={`cp-result-item ${r.isCorrect ? "cp-ri-correct" : "cp-ri-wrong"}`}>
              <div className="cp-ri-header">
                <span className="cp-ri-icon">{r.isCorrect ? <IconCheck /> : <IconX />}</span>
                <span className="cp-ri-q">Q{i + 1}: {r.question}</span>
              </div>
              {!r.isCorrect && (
                <div className="cp-ri-detail">
                  <span className="cp-ri-yours">Your answer: <strong>{r.userAnswer || "—"}</strong></span>
                  <span className="cp-ri-correct-ans">Correct: <strong>{r.correctAnswer} — {r.correctAnswerText || ""}</strong></span>
                  {r.explanation && <p className="cp-ri-explain">{r.explanation}</p>}
                </div>
              )}
            </div>
          ))}
        </div>

        {error && <div className="cp-error"><p>{error}</p></div>}

        {!passed && !reteaching && (
          <div className="cp-fail-actions">
            <p className="cp-fail-hint">Let's review what you found difficult, then try again.</p>
            <button className="ls-btn-primary" onClick={handleGenerateReteaching} disabled={loadingReteach}>
              {loadingReteach ? <><IconSpinner /> Generating Review…</> : "Review & Retry"}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Active question ──
  const optionEntries = q?.options ? Object.entries(q.options).filter(([k]) => OPTION_LABELS.includes(k)) : [];

  return (
    <div className="cp-stage">
      {/* Header */}
      <div className="cp-header">
        <div className="cp-header-top">
          <span className="cp-header-label">Checkpoint</span>
          <span className="cp-q-counter">Question {currentQ + 1} of {totalQ}</span>
        </div>
        <div className="cp-q-progress">
          {questions.map((_, i) => (
            <div key={i} className={`cp-q-dot ${i < currentQ ? "cp-qd-done" : i === currentQ ? "cp-qd-active" : ""}`} />
          ))}
        </div>
      </div>

      {/* Question */}
      <div className="cp-question-card">
        <p className="cp-question-text">{q?.question}</p>
        <div className="cp-options">
          {optionEntries.map(([letter, text]) => {
            const selected = currentAnswer === letter;
            return (
              <button
                key={letter}
                className={`cp-option ${selected ? "cp-option-selected" : ""}`}
                onClick={() => handleSelectAnswer(letter)}
                disabled={submitting}
              >
                <span className={`cp-option-letter ${selected ? "cp-ol-selected" : ""}`}>{letter}</span>
                <span className="cp-option-text">{text}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error && <div className="cp-error"><p>{error}</p></div>}

      {/* Nav */}
      <div className="cp-nav">
        {currentQ < totalQ - 1 ? (
          <button
            className="ls-btn-primary"
            onClick={handleNextQuestion}
            disabled={!currentAnswer}
          >
            Next <IconArrow />
          </button>
        ) : (
          <button
            className="ls-btn-primary"
            onClick={handleSubmit}
            disabled={submitting || !allAnswered}
          >
            {submitting ? <><IconSpinner /> Checking…</> : "Submit Answers"}
          </button>
        )}
        {currentQ > 0 && (
          <button className="ls-btn-ghost" onClick={() => setCurrentQ(i => i - 1)} disabled={submitting}>
            ← Back
          </button>
        )}
      </div>
      {!currentAnswer && (
        <p className="cp-hint-text">Select an answer to continue.</p>
      )}
    </div>
  );
}
