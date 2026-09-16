/**
 * ChallengeFindPartnerPage — /app/challenge/find/:conceptId
 *
 * Calls /api/v1/challenge/find to find or create a waiting session.
 * If a partner is found immediately → redirect to lobby.
 * If not → show waiting state with polling.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";

const IconUsers = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const IconSpinner = () => (
  <svg className="ch-spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" opacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" />
  </svg>
);

export default function ChallengeFindPartnerPage() {
  const { conceptId } = useParams();
  const navigate = useNavigate();

  const [status, setStatus]       = useState("searching"); // searching | waiting | error
  const [sessionId, setSessionId] = useState(null);
  const [conceptName, setConceptName] = useState("");
  const [error, setError]         = useState(null);
  const [waitSecs, setWaitSecs]   = useState(0);
  const pollRef = useRef(null);
  const timerRef = useRef(null);

  const stopPolling = () => {
    if (pollRef.current)  clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const startSearch = useCallback(async () => {
    setStatus("searching");
    setError(null);
    setWaitSecs(0);

    try {
      // Load concept name for display
      try {
        const prog = await api.conceptGetProgress(conceptId);
        if (prog?.concept?.name) setConceptName(prog.concept.name);
      } catch (_) { /* non-fatal */ }

      const result = await api.challengeFind({ conceptId: Number(conceptId) });

      if (!result.ok) throw new Error(result.message || "Could not find a challenge.");

      const sess = result.session;
      setSessionId(sess.id);

      if (result.joined || sess.status === "lobby") {
        // Partner found immediately
        navigate(`/app/challenge/lobby/${sess.id}`, { replace: true });
        return;
      }

      // Waiting for a partner — poll
      setStatus("waiting");
      timerRef.current = setInterval(() => setWaitSecs(s => s + 1), 1000);

      pollRef.current = setInterval(async () => {
        try {
          const updated = await api.challengeGet(sess.id);
          if (updated?.session?.status === "lobby") {
            stopPolling();
            navigate(`/app/challenge/lobby/${sess.id}`, { replace: true });
          }
        } catch (_) { /* network hiccup — keep polling */ }
      }, 4000);

    } catch (err) {
      setStatus("error");
      setError(err.message || "Something went wrong. Please try again.");
    }
  }, [conceptId, navigate]);

  useEffect(() => {
    startSearch();
    return stopPolling;
  }, [startSearch]);

  const handleCancel = async () => {
    stopPolling();
    if (sessionId) {
      try { await api.challengeCancel(sessionId); } catch (_) { /* ignore */ }
    }
    navigate(-1);
  };

  const handleContinueLearning = () => {
    stopPolling();
    if (sessionId) api.challengeCancel(sessionId).catch(() => {});
    navigate(`/app/learn/concept/${conceptId}`);
  };

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="ch-find-page">
      <div className="ch-find-card">
        <div className="ch-find-icon">
          <IconUsers />
        </div>

        {status === "searching" && (
          <>
            <h2 className="ch-find-title">Finding a Partner…</h2>
            <p className="ch-find-sub">Looking for a student at the same concept and stage.</p>
            <div className="ch-find-spinner-row">
              <IconSpinner />
              <span>Searching…</span>
            </div>
          </>
        )}

        {status === "waiting" && (
          <>
            <h2 className="ch-find-title">Waiting for a Partner</h2>
            {conceptName && (
              <div className="ch-find-concept-name">{conceptName}</div>
            )}
            <p className="ch-find-sub">
              No one is available right now. You'll be matched automatically when
              another student reaches this stage.
            </p>
            <div className="ch-find-wait-timer">{fmt(waitSecs)}</div>
            <div className="ch-find-spinner-row">
              <IconSpinner />
              <span>Waiting for a match…</span>
            </div>

            <div className="ch-find-actions">
              <button className="ch-btn-secondary" onClick={handleContinueLearning}>
                Continue Learning
              </button>
              <button className="ch-btn-ghost" onClick={handleCancel}>
                Cancel
              </button>
            </div>

            <p className="ch-find-note">
              You won't lose your progress. Come back any time to find a partner.
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <h2 className="ch-find-title">Something Went Wrong</h2>
            <p className="ch-find-sub ch-error-text">{error}</p>
            <div className="ch-find-actions">
              <button className="ch-btn-primary" onClick={startSearch}>
                Try Again
              </button>
              <button className="ch-btn-secondary" onClick={handleContinueLearning}>
                Continue Learning
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
