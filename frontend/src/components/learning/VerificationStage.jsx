/**
 * VerificationStage — Passive display of AI verification results.
 * The actual verification happens inside ExplainStage.
 * This stage just shows the stored result and indicates next steps.
 */

function IconCheck() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}
function IconX() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="m18 6-12 12M6 6l12 12" />
    </svg>
  );
}
function IconPartial() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="10" /><path d="M12 6v6" /><path d="M12 16h.01" />
    </svg>
  );
}

export default function VerificationStage({ progress }) {
  const result = progress?.aiVerificationResult;
  const passed = progress?.aiVerificationPassed;

  if (!result) {
    return (
      <div className="vr-stage">
        <div className="vr-waiting">
          <div className="vr-wait-icon">🤖</div>
          <h2>Waiting for Verification</h2>
          <p>Submit your explanation in the <strong>Explain It</strong> stage to receive AI feedback here.</p>
        </div>
      </div>
    );
  }

  const verdict = result.verdict;
  const score = result.score;

  return (
    <div className="vr-stage">
      {/* Result header */}
      <div className={`vr-result-header vr-result-${verdict}`}>
        <div className="vr-result-icon">
          {passed ? <IconCheck /> : verdict === "partial" ? <IconPartial /> : <IconX />}
        </div>
        <div>
          <h2 className="vr-result-title">
            {passed ? "Understanding Verified" : verdict === "partial" ? "Partially Understood" : "Needs More Detail"}
          </h2>
          {score != null && (
            <div className="vr-score">Score: {score}/100</div>
          )}
        </div>
      </div>

      {/* Feedback */}
      {result.feedback && (
        <div className="vr-feedback">
          <div className="vr-section-label">AI Feedback</div>
          <p>{result.feedback}</p>
        </div>
      )}

      {/* Breakdown */}
      {result.correct_points?.length > 0 && (
        <div className="vr-points vr-points-good">
          <div className="vr-section-label">✓ What you got right</div>
          <ul>{result.correct_points.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}
      {result.missing_points?.length > 0 && (
        <div className="vr-points vr-points-miss">
          <div className="vr-section-label">◉ What's missing</div>
          <ul>{result.missing_points.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}
      {result.incorrect_points?.length > 0 && (
        <div className="vr-points vr-points-wrong">
          <div className="vr-section-label">✗ Needs correction</div>
          <ul>{result.incorrect_points.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}
      {result.misconceptions_detected?.length > 0 && (
        <div className="vr-misc">
          <div className="vr-section-label">⚠ Misconceptions detected</div>
          {result.misconceptions_detected.map((m, i) => (
            <div key={i} className="vr-misc-item">
              <p><strong>Misconception:</strong> {m.name}</p>
              <p><strong>Correction:</strong> {m.correction}</p>
            </div>
          ))}
        </div>
      )}

      {/* Next steps */}
      <div className="vr-next">
        {passed ? (
          <div className="vr-next-pass">
            <IconCheck />
            <p>You're ready for the Challenge! Proceed to Ask AI or find a Challenge partner.</p>
          </div>
        ) : (
          <div className="vr-next-retry">
            <p>Go back to <strong>Explain It</strong> and try again using the feedback above.</p>
            {result.hint && <div className="vr-hint"><strong>Hint:</strong> {result.hint}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
