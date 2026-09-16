/**
 * ChallengeCompletePage — /app/challenge/complete/:sessionId
 *
 * Shows final result: passed or failed.
 * If passed → concept is VERIFIED → next concept unlocked.
 * If failed → shows personalised gaps → "Start Reteaching" returns to lesson.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";

const IconTrophy = () => (
  <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M6 9H4a2 2 0 0 1-2-2V5h4M18 9h2a2 2 0 0 0 2-2V5h-4" />
    <path d="M6 9a6 6 0 0 0 12 0V3H6z" />
    <path d="M12 15v3M8 21h8M9 18h6" />
  </svg>
);
const IconRetry = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M1 4v6h6M23 20v-6h-6" />
    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" />
  </svg>
);
const IconSpinner = () => (
  <svg className="ch-spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" opacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" />
  </svg>
);
const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="m5 12 5 5L20 7" />
  </svg>
);

export default function ChallengeCompletePage() {
  const { sessionId } = useParams();
  const navigate      = useNavigate();

  const [session,    setSession]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [reteaching, setReteaching] = useState(false);

  useEffect(() => {
    api.challengeGet(sessionId)
      .then(d => setSession(d.session))
      .catch(err => setError(err.message || "Could not load result."))
      .finally(() => setLoading(false));
  }, [sessionId]);

  async function handleStartReteaching(conceptId, gaps) {
    setReteaching(true);
    try {
      // Reset progress on backend (challenge-failed endpoint)
      await api.conceptChallengeFailed(conceptId, { missedKeyPoints: gaps || [] });
      navigate(`/app/learn/concept/${conceptId}`);
    } catch (err) {
      setError(err.message || "Could not start reteaching.");
    } finally {
      setReteaching(false);
    }
  }

  if (loading) {
    return (
      <div className="ch-complete-page">
        <div className="ch-complete-card">
          <IconSpinner />
          <p>Loading result…</p>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="ch-complete-page">
        <div className="ch-complete-card">
          <p className="ch-error-text">{error || "Session not found."}</p>
          <button className="ch-btn-secondary" onClick={() => navigate("/app/solo")}>
            Back to Learning
          </button>
        </div>
      </div>
    );
  }

  const myPassed  = session.myPassed;
  const myScore   = session.myScore;
  const evalResult = session.evaluationResult;
  const myRole     = session.myRole;
  const conceptId  = session.conceptId;

  const myFeedback = myRole === "initiator"
    ? evalResult?.initiatorFeedback
    : evalResult?.partnerFeedback;
  const myGaps = myRole === "initiator"
    ? evalResult?.initiatorGaps || []
    : evalResult?.partnerGaps   || [];

  return (
    <div className="ch-complete-page">
      <div className="ch-complete-card">

        {/* Result header */}
        {myPassed ? (
          <div className="ch-result-header ch-result-passed">
            <div className="ch-result-icon passed"><IconTrophy /></div>
            <h2>Challenge Passed!</h2>
            <p className="ch-result-sub">Concept Verified ✓</p>
            {myScore !== null && myScore !== undefined && (
              <div className="ch-result-score">Score: {myScore}%</div>
            )}
          </div>
        ) : (
          <div className="ch-result-header ch-result-failed">
            <div className="ch-result-icon failed"><IconRetry /></div>
            <h2>Needs More Practice</h2>
            <p className="ch-result-sub">
              Don't worry — this is part of learning. Review the gaps and try again.
            </p>
            {myScore !== null && myScore !== undefined && (
              <div className="ch-result-score">Score: {myScore}%</div>
            )}
          </div>
        )}

        {/* AI Feedback */}
        {myFeedback && (
          <div className="ch-result-feedback">
            <div className="ch-result-section-title">Feedback</div>
            <p>{myFeedback}</p>
          </div>
        )}

        {/* Gaps (only shown on fail) */}
        {!myPassed && myGaps.length > 0 && (
          <div className="ch-result-gaps">
            <div className="ch-result-section-title">Areas to review</div>
            <ul className="ch-gaps-list">
              {myGaps.map((gap, i) => (
                <li key={i} className="ch-gap-item">
                  <span className="ch-gap-bullet">•</span>
                  {gap}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Partner's result summary (no private info) */}
        {session.status === "completed" && (
          <div className="ch-result-partner-summary">
            <div className="ch-result-section-title">Session Summary</div>
            <p>{evalResult?.overallSummary}</p>
          </div>
        )}

        {/* Actions */}
        <div className="ch-complete-actions">
          {myPassed ? (
            <>
              <button
                className="ch-btn-primary"
                onClick={() => navigate(`/app/learn`)}
              >
                Continue Learning →
              </button>
              <button
                className="ch-btn-secondary"
                onClick={() => navigate("/app/challenge/history")}
              >
                View Challenge History
              </button>
            </>
          ) : (
            <>
              <button
                className="ch-btn-primary"
                onClick={() => handleStartReteaching(conceptId, myGaps)}
                disabled={reteaching}
              >
                {reteaching
                  ? <><IconSpinner /> Starting reteaching…</>
                  : "Review and Try Again →"
                }
              </button>
              <button
                className="ch-btn-ghost"
                onClick={() => navigate(`/app/learn/concept/${conceptId}`)}
              >
                Go Back to Concept
              </button>
            </>
          )}
        </div>

        {myPassed && (
          <div className="ch-verified-note">
            <IconCheck />
            <span>
              This concept is now <strong>Verified</strong>. The next concept in the topic is unlocked.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
