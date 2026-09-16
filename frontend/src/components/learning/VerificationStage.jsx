// Simple inline icon components
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
 * VerificationStage — Display AI verification results
 */
export default function VerificationStage({ conceptId, progress }) {
  if (!progress?.aiVerificationResult) {
    return (
      <div className="verification-stage">
        <div className="verification-waiting">
          <AlertCircle size={48} className="verification-icon" />
          <h2>Waiting for Verification</h2>
          <p>Submit your explanation in the Explain It stage to receive AI feedback.</p>
        </div>
      </div>
    );
  }

  const result = progress.aiVerificationResult;
  const passed = result.verdict === "correct" && result.demonstrated_understanding;

  return (
    <div className="verification-stage">
      <div className="verification-result">
        <div className={`verification-header ${passed ? 'passed' : 'failed'}`}>
          {passed ? (
            <>
              <CheckCircle size={48} />
              <h2>Understanding Verified!</h2>
              <p className="verification-score">Score: {result.score}/100</p>
            </>
          ) : (
            <>
              <XCircle size={48} />
              <h2>Needs Improvement</h2>
              <p className="verification-score">Score: {result.score}/100</p>
            </>
          )}
        </div>

        {/* Feedback */}
        <div className="verification-feedback">
          <h3>AI Feedback:</h3>
          <p className="feedback-text">{result.feedback}</p>
        </div>

        {/* Correct Points */}
        {result.correct_points && result.correct_points.length > 0 && (
          <div className="points-section correct-points">
            <h4>✓ What You Got Right:</h4>
            <ul>
              {result.correct_points.map((point, idx) => (
                <li key={idx}>{point}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Missing Points */}
        {result.missing_points && result.missing_points.length > 0 && (
          <div className="points-section missing-points">
            <h4>⚠ What's Missing:</h4>
            <ul>
              {result.missing_points.map((point, idx) => (
                <li key={idx}>{point}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Incorrect Points */}
        {result.incorrect_points && result.incorrect_points.length > 0 && (
          <div className="points-section incorrect-points">
            <h4>✗ Needs Correction:</h4>
            <ul>
              {result.incorrect_points.map((point, idx) => (
                <li key={idx}>{point}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Misconceptions */}
        {result.misconceptions_detected && result.misconceptions_detected.length > 0 && (
          <div className="points-section misconceptions">
            <h4>Common Misconceptions Detected:</h4>
            {result.misconceptions_detected.map((misc, idx) => (
              <div key={idx} className="misconception-item">
                <p><strong>Misconception:</strong> {misc.name}</p>
                <p><strong>Correction:</strong> {misc.correction}</p>
              </div>
            ))}
          </div>
        )}

        {/* Hint for retry */}
        {result.hint && !passed && (
          <div className="verification-hint">
            <h4>Hint:</h4>
            <p>{result.hint}</p>
          </div>
        )}

        {/* Next steps */}
        <div className="verification-actions">
          {passed ? (
            <div className="success-message">
              <p>You're ready for the Challenge! You can now ask AI questions or proceed to find a peer partner.</p>
            </div>
          ) : result.should_retry ? (
            <div className="retry-message">
              <p>Go back to Explain It and try again with the feedback provided.</p>
            </div>
          ) : (
            <div className="reteach-message">
              <p>Consider reviewing the lesson again before retrying your explanation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
