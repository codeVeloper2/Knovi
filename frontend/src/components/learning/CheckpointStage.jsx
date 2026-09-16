import { useState, useEffect } from "react";
import * as api from "../../api";

// Simple inline icon components
const Loader = () => (
  <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" opacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75" />
  </svg>
);

const CheckCircle = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const XCircle = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <path d="m15 9-6 6m0-6 6 6" />
  </svg>
);

const AlertCircle = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

/**
 * CheckpointStage — Test understanding with questions generated from the lesson
 */
export default function CheckpointStage({ conceptId, progress, onComplete }) {
  const [loading, setLoading] = useState(false);
  const [checkpoint, setCheckpoint] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [reteaching, setReteaching] = useState(null);
  const [loadingReteach, setLoadingReteach] = useState(false);

  useEffect(() => {
    // Check if checkpoint already attempted
    if (progress?.checkpointAttempts && progress.checkpointAttempts.length > 0) {
      const lastAttempt = progress.checkpointAttempts[progress.checkpointAttempts.length - 1];
      if (lastAttempt.checkpoint) {
        setCheckpoint(lastAttempt.checkpoint);
      }
      if (!progress.checkpointPassed) {
        setResult({
          passed: false,
          score: lastAttempt.score,
          results: lastAttempt.results,
          needsReteaching: true,
          missedKeyPoints: lastAttempt.missedKeyPoints || [],
        });
      }
    }
  }, [progress]);

  const handleGenerateCheckpoint = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.post(`/api/v1/concepts/${conceptId}/generate-checkpoint`);
      
      if (!response.ok) {
        throw new Error(response.message || "Failed to generate checkpoint");
      }

      setCheckpoint(response.checkpoint);
      setAnswers({});
      setResult(null);
    } catch (err) {
      console.error("Error generating checkpoint:", err);
      setError(err.message || "Failed to generate checkpoint. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerChange = (questionIndex, value) => {
    setAnswers(prev => ({
      ...prev,
      [questionIndex]: value,
    }));
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError(null);

      const response = await api.post(`/api/v1/concepts/${conceptId}/submit-checkpoint`, {
        answers,
        checkpoint: checkpoint,
      });
      
      if (!response.ok) {
        throw new Error(response.message || "Failed to submit checkpoint");
      }

      setResult(response);

      if (response.passed && onComplete) {
        // Refresh progress to unlock explain stage
        await onComplete();
      }
    } catch (err) {
      console.error("Error submitting checkpoint:", err);
      setError(err.message || "Failed to submit checkpoint. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateReteaching = async () => {
    if (!result?.missedKeyPoints || result.missedKeyPoints.length === 0) {
      return;
    }

    try {
      setLoadingReteach(true);
      setError(null);

      const response = await api.post(`/api/v1/concepts/${conceptId}/generate-reteaching`, {
        missedKeyPoints: result.missedKeyPoints,
      });
      
      if (!response.ok) {
        throw new Error(response.message || "Failed to generate reteaching");
      }

      setReteaching(response.reteaching);
    } catch (err) {
      console.error("Error generating reteaching:", err);
      setError(err.message || "Failed to generate reteaching. Please try again.");
    } finally {
      setLoadingReteach(false);
    }
  };

  const handleRetry = () => {
    setResult(null);
    setAnswers({});
    setReteaching(null);
    handleGenerateCheckpoint();
  };

  // If checkpoint not generated yet
  if (!checkpoint) {
    return (
      <div className="checkpoint-stage">
        <div className="checkpoint-intro">
          <AlertCircle size={48} className="checkpoint-intro-icon" />
          <h2>Ready for Checkpoint?</h2>
          <p>
            Answer a few questions to test your understanding of the lesson.
            The questions are based on what you just learned.
          </p>
          
          {error && (
            <div className="error-message">
              <p>{error}</p>
            </div>
          )}

          <button
            onClick={handleGenerateCheckpoint}
            disabled={loading}
            className="btn-primary btn-large"
          >
            {loading ? (
              <>
                <Loader className="spinner" size={20} />
                Generating Questions...
              </>
            ) : (
              "Start Checkpoint"
            )}
          </button>
        </div>
      </div>
    );
  }

  // Show results if submitted
  if (result) {
    return (
      <div className="checkpoint-stage">
        <div className="checkpoint-result">
          <div className={`result-header ${result.passed ? 'passed' : 'failed'}`}>
            {result.passed ? (
              <>
                <CheckCircle size={48} />
                <h2>Checkpoint Passed!</h2>
                <p className="result-score">Score: {result.score}%</p>
              </>
            ) : (
              <>
                <XCircle size={48} />
                <h2>Checkpoint Not Passed</h2>
                <p className="result-score">Score: {result.score}%</p>
                <p>You need to review some concepts before moving forward.</p>
              </>
            )}
          </div>

          {/* Show detailed results */}
          <div className="checkpoint-results-list">
            <h3>Your Answers:</h3>
            {result.results && result.results.map((r, idx) => (
              <div key={idx} className={`result-item ${r.isCorrect ? 'correct' : 'incorrect'}`}>
                <div className="result-question">
                  <strong>Q{idx + 1}:</strong> {r.question}
                </div>
                <div className="result-answer">
                  <span className="label">Your answer:</span> {r.userAnswer || "(No answer)"}
                </div>
                {!r.isCorrect && (
                  <div className="result-correct-answer">
                    <span className="label">Correct answer:</span> {r.correctAnswer}
                  </div>
                )}
                {r.explanation && (
                  <div className="result-explanation">
                    <span className="label">Explanation:</span> {r.explanation}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          {result.passed ? (
            <div className="checkpoint-actions">
              <p className="success-message">Proceed to the Explain It stage!</p>
            </div>
          ) : (
            <div className="checkpoint-actions">
              {!reteaching ? (
                <>
                  <p className="hint-message">
                    Let's review the concepts you struggled with and try again.
                  </p>
                  <button
                    onClick={handleGenerateReteaching}
                    disabled={loadingReteach}
                    className="btn-primary"
                  >
                    {loadingReteach ? (
                      <>
                        <Loader className="spinner" size={20} />
                        Generating Review...
                      </>
                    ) : (
                      "Review and Retry"
                    )}
                  </button>
                </>
              ) : (
                <div className="reteaching-content">
                  <h3>{reteaching.title}</h3>
                  <p>{reteaching.introduction}</p>
                  
                  {reteaching.sections && reteaching.sections.map((section, idx) => (
                    <div key={idx} className="reteach-section">
                      <h4>{section.heading}</h4>
                      <p>{section.content}</p>
                    </div>
                  ))}

                  <button onClick={handleRetry} className="btn-primary">
                    Try Checkpoint Again
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Show checkpoint questions
  const questions = checkpoint.questions || [];
  const allAnswered = questions.every((_, idx) => answers[idx] && answers[idx].trim() !== '');

  return (
    <div className="checkpoint-stage">
      <div className="checkpoint-questions">
        <div className="checkpoint-header">
          <h2>Checkpoint Questions</h2>
          <p>Answer all questions to test your understanding.</p>
        </div>

        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}

        <div className="questions-list">
          {questions.map((q, idx) => (
            <div key={idx} className="question-item">
              <div className="question-number">Question {idx + 1}</div>
              <div className="question-text">{q.question}</div>

              {q.type === 'multiple_choice' ? (
                <div className="question-options">
                  {q.options && q.options.map((option, oidx) => (
                    <label key={oidx} className="option-label">
                      <input
                        type="radio"
                        name={`question-${idx}`}
                        value={option}
                        checked={answers[idx] === option}
                        onChange={(e) => handleAnswerChange(idx, e.target.value)}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="question-input">
                  <input
                    type="text"
                    placeholder="Type your answer..."
                    value={answers[idx] || ''}
                    onChange={(e) => handleAnswerChange(idx, e.target.value)}
                    className="answer-input"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="checkpoint-actions">
          <button
            onClick={handleSubmit}
            disabled={submitting || !allAnswered}
            className="btn-primary btn-large"
          >
            {submitting ? (
              <>
                <Loader className="spinner" size={20} />
                Submitting...
              </>
            ) : (
              "Submit Answers"
            )}
          </button>
          {!allAnswered && (
            <p className="hint-text">Please answer all questions before submitting.</p>
          )}
        </div>
      </div>
    </div>
  );
}
