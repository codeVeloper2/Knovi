/**
 * ChallengeSessionPage — /app/challenge/session/:sessionId
 *
 * Phases:
 *  questions     → both answer 5 AI questions independently
 *  peer_exchange → each asks the other 1 question; AI evaluates answers
 *  evaluating    → AI computes final result (auto-triggered)
 *  completed     → redirect to result page
 *  failed        → redirect to result page
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";

const POLL_MS = 3000;
const HB_MS   = 20000;

// ─── Icons ────────────────────────────────────────────────────────────────────
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
const IconX = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="m18 6-12 12M6 6l12 12" />
  </svg>
);

// ─── Questions Phase ──────────────────────────────────────────────────────────

function QuestionsPhase({ session, onAnswersSubmitted }) {
  const [questions, setQuestions]   = useState(null);
  const [answers, setAnswers]       = useState({});
  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [score, setScore]           = useState(null);
  const [results, setResults]       = useState(null);
  const [error, setError]           = useState(null);
  const pollRef = useRef(null);

  // Check if already submitted
  const alreadyAnswered = session.myAnswers && Object.keys(session.myAnswers).length > 0;

  const loadQuestions = useCallback(async () => {
    try {
      const data = await api.challengeGenerateQuestions(session.id);
      if (data.questions) {
        setQuestions(data.questions);
      }
    } catch (err) {
      setError(err.message || "Failed to load questions.");
    } finally {
      setLoading(false);
    }
  }, [session.id]);

  useEffect(() => {
    if (alreadyAnswered) {
      setSubmitted(true);
      setScore(session.myScore);
      setLoading(false);
      // Poll until both submitted
      pollRef.current = setInterval(async () => {
        try {
          const updated = await api.challengeGet(session.id);
          if (updated.session.status === "peer_exchange") {
            clearInterval(pollRef.current);
            onAnswersSubmitted(updated.session);
          }
        } catch (_) {}
      }, POLL_MS);
    } else {
      loadQuestions();
    }
    return () => clearInterval(pollRef.current);
  }, []);

  async function handleSubmit() {
    const qs = questions?.questions || [];
    if (qs.some((_, i) => !answers[String(i)])) {
      setError("Please answer all questions before submitting.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const data = await api.challengeSubmitAnswers(session.id, { answers });
      setSubmitted(true);
      setScore(data.score);
      setResults(data.results);

      if (data.bothSubmitted) {
        onAnswersSubmitted(data.session);
      } else {
        // Wait for partner
        pollRef.current = setInterval(async () => {
          try {
            const updated = await api.challengeGet(session.id);
            if (updated.session.status === "peer_exchange") {
              clearInterval(pollRef.current);
              onAnswersSubmitted(updated.session);
            }
          } catch (_) {}
        }, POLL_MS);
      }
    } catch (err) {
      setError(err.message || "Failed to submit answers.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="ch-phase-loading">
        <IconSpinner />
        <span>Loading questions…</span>
      </div>
    );
  }

  const qs = questions?.questions || [];

  if (submitted) {
    return (
      <div className="ch-submitted-wait">
        <div className="ch-submitted-score">
          Your score: <strong>{score}%</strong>
        </div>
        <div className="ch-waiting-msg">
          <IconSpinner />
          <span>Waiting for your partner to finish…</span>
        </div>
        {results && (
          <div className="ch-q-results">
            {results.map((r, i) => (
              <div key={i} className={`ch-q-result-row ${r.isCorrect ? "correct" : "incorrect"}`}>
                <span className="ch-q-result-icon">{r.isCorrect ? <IconCheck /> : <IconX />}</span>
                <span>Q{i + 1}: {r.isCorrect ? "Correct" : `Incorrect — ${r.explanation || r.correctAnswer}`}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ch-questions-phase">
      <div className="ch-phase-header">
        <h3>5 Questions</h3>
        <p>Answer independently. Your partner cannot see your answers.</p>
      </div>

      {error && <div className="ch-error-banner">{error}</div>}

      <div className="ch-questions-list">
        {qs.map((q, idx) => (
          <div key={idx} className="ch-question-card">
            <div className="ch-q-num">Question {idx + 1} of {qs.length}</div>
            <div className="ch-q-text">{q.question}</div>
            <div className="ch-q-options">
              {Object.entries(q.options || {}).map(([letter, text]) => (
                <button
                  key={letter}
                  className={`ch-q-option ${answers[String(idx)] === letter ? "selected" : ""}`}
                  onClick={() => setAnswers(prev => ({ ...prev, [String(idx)]: letter }))}
                >
                  <span className="ch-q-option-letter">{letter}</span>
                  <span>{text}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="ch-phase-actions">
        <button
          className="ch-btn-primary"
          onClick={handleSubmit}
          disabled={submitting || qs.some((_, i) => !answers[String(i)])}
        >
          {submitting ? <><IconSpinner /> Submitting…</> : "Submit Answers"}
        </button>
        {qs.some((_, i) => !answers[String(i)]) && (
          <p className="ch-hint-text">Answer all {qs.length} questions to submit.</p>
        )}
      </div>
    </div>
  );
}

// ─── Peer Exchange Phase ──────────────────────────────────────────────────────

function PeerExchangePhase({ session, onExchangeComplete }) {
  const [currentSession, setCurrentSession] = useState(session);
  const [myQuestion, setMyQuestion]         = useState("");
  const [asking, setAsking]                 = useState(false);
  const [myAnswer, setMyAnswer]             = useState("");
  const [answering, setAnswering]           = useState(false);
  const [hintLoading, setHintLoading]       = useState(false);
  const [error, setError]                   = useState(null);
  const pollRef = useRef(null);

  const myRole     = currentSession.myRole;
  const exchanges  = currentSession.peerExchanges || [];

  // Find the question asked TO me (I am the answerer)
  const questionForMe = exchanges.find(
    e => e.askerRole !== myRole && e.answer === null
  );
  // The question I asked
  const myAskedExchange = exchanges.find(
    e => e.askerRole === myRole
  );

  const iHaveAsked    = !!myAskedExchange;
  const allDone       = exchanges.length >= 2 && exchanges.every(e => e.answer !== null);

  // Poll for partner's question or answers
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const data = await api.challengeGet(currentSession.id);
        setCurrentSession(data.session);
        if (data.session.status === "evaluating" || data.session.status === "completed" || data.session.status === "failed") {
          clearInterval(pollRef.current);
          onExchangeComplete(data.session);
        }
      } catch (_) {}
    }, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [currentSession.id]);

  async function handleAsk() {
    if (!myQuestion.trim()) return;
    setAsking(true);
    setError(null);
    try {
      const data = await api.challengeAskPeer(currentSession.id, { question: myQuestion.trim() });
      setCurrentSession(data.session);
      setMyQuestion("");
    } catch (err) {
      setError(err.message || "Failed to send question.");
    } finally {
      setAsking(false);
    }
  }

  async function handleAnswer() {
    if (!myAnswer.trim() || !questionForMe) return;
    setAnswering(true);
    setError(null);
    try {
      const data = await api.challengeAnswerPeer(currentSession.id, {
        exchangeIndex: questionForMe.index,
        answer: myAnswer.trim(),
      });
      setCurrentSession(data.session);
      if (data.session.status === "evaluating") {
        clearInterval(pollRef.current);
        onExchangeComplete(data.session);
      }
    } catch (err) {
      setError(err.message || "Failed to submit answer.");
    } finally {
      setAnswering(false);
    }
  }

  async function handleHint() {
    if (!questionForMe) return;
    setHintLoading(true);
    try {
      const data = await api.challengeRequestHint(currentSession.id, { exchangeIndex: questionForMe.index });
      // Refresh session to get updated hint
      const updated = await api.challengeGet(currentSession.id);
      setCurrentSession(updated.session);
    } catch (_) {}
    setHintLoading(false);
  }

  const updatedQuestionForMe = (currentSession.peerExchanges || []).find(
    e => e.askerRole !== myRole && e.answer === null
  );
  const updatedMyAsked = (currentSession.peerExchanges || []).find(
    e => e.askerRole === myRole
  );

  return (
    <div className="ch-exchange-phase">
      <div className="ch-phase-header">
        <h3>Peer Exchange</h3>
        <p>Ask your partner one question, then answer theirs. AI will evaluate understanding.</p>
      </div>

      {error && <div className="ch-error-banner">{error}</div>}

      {/* Ask section */}
      <div className="ch-exchange-section">
        <div className="ch-exchange-section-title">Your Question for Partner</div>
        {!updatedMyAsked ? (
          <div className="ch-ask-area">
            <textarea
              className="ch-textarea"
              placeholder="Ask your partner a question about this concept…"
              value={myQuestion}
              onChange={e => setMyQuestion(e.target.value)}
              rows={3}
              disabled={asking}
            />
            <button
              className="ch-btn-primary"
              onClick={handleAsk}
              disabled={asking || !myQuestion.trim()}
            >
              {asking ? <><IconSpinner /> Asking…</> : "Ask Partner →"}
            </button>
          </div>
        ) : (
          <div className="ch-asked-display">
            <div className="ch-asked-q">{updatedMyAsked.question}</div>
            {updatedMyAsked.answer !== null ? (
              <div className={`ch-partner-answer ${updatedMyAsked.isCorrect ? "correct" : "incorrect"}`}>
                <div className="ch-partner-answer-label">Partner answered:</div>
                <div className="ch-partner-answer-text">{updatedMyAsked.answer}</div>
                <div className="ch-partner-answer-result">
                  {updatedMyAsked.isCorrect === true  && <><IconCheck /> Correct</>}
                  {updatedMyAsked.isCorrect === false && <><IconX /> Needs improvement</>}
                  {updatedMyAsked.isCorrect === null  && "AI evaluation pending"}
                </div>
              </div>
            ) : (
              <div className="ch-waiting-msg"><IconSpinner /> Waiting for partner's answer…</div>
            )}
          </div>
        )}
      </div>

      {/* Answer section */}
      <div className="ch-exchange-section">
        <div className="ch-exchange-section-title">Partner's Question for You</div>
        {!updatedQuestionForMe ? (
          <div className="ch-waiting-msg">
            <IconSpinner />
            <span>Waiting for partner to ask their question…</span>
          </div>
        ) : (
          <div className="ch-answer-area">
            <div className="ch-their-question">{updatedQuestionForMe.question}</div>

            {updatedQuestionForMe.hint && (
              <div className="ch-hint-box">
                <strong>Hint:</strong> {updatedQuestionForMe.hint}
              </div>
            )}

            <textarea
              className="ch-textarea"
              placeholder="Type your answer…"
              value={myAnswer}
              onChange={e => setMyAnswer(e.target.value)}
              rows={3}
              disabled={answering}
            />

            <div className="ch-answer-actions">
              <button
                className="ch-btn-primary"
                onClick={handleAnswer}
                disabled={answering || !myAnswer.trim()}
              >
                {answering ? <><IconSpinner /> Submitting…</> : "Submit Answer"}
              </button>
              {!updatedQuestionForMe.hintUsed && (
                <button
                  className="ch-btn-ghost"
                  onClick={handleHint}
                  disabled={hintLoading}
                >
                  {hintLoading ? "Getting hint…" : "Ask for a hint"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {allDone && (
        <div className="ch-phase-done">
          <IconSpinner /> Evaluating your Challenge session…
        </div>
      )}
    </div>
  );
}

// ─── Evaluating Phase ─────────────────────────────────────────────────────────

function EvaluatingPhase({ session, onEvaluationDone }) {
  const [triggered, setTriggered] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    // Trigger evaluation (idempotent on backend)
    if (!triggered) {
      setTriggered(true);
      api.challengeEvaluate(session.id)
        .then(data => {
          if (data.session.status === "completed" || data.session.status === "failed") {
            onEvaluationDone(data.session);
          }
        })
        .catch(() => {});
    }

    // Poll as fallback
    pollRef.current = setInterval(async () => {
      try {
        const data = await api.challengeGet(session.id);
        if (data.session.status === "completed" || data.session.status === "failed") {
          clearInterval(pollRef.current);
          onEvaluationDone(data.session);
        }
      } catch (_) {}
    }, 3000);

    return () => clearInterval(pollRef.current);
  }, []);

  return (
    <div className="ch-evaluating">
      <IconSpinner />
      <h3>Evaluating your Challenge…</h3>
      <p>AI is reviewing your answers and peer exchange. This takes a few seconds.</p>
    </div>
  );
}

// ─── Main Session Page ────────────────────────────────────────────────────────

export default function ChallengeSessionPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const hbRef = useRef(null);

  useEffect(() => {
    api.challengeGet(sessionId)
      .then(d => setSession(d.session))
      .catch(() => {})
      .finally(() => setLoading(false));

    hbRef.current = setInterval(() => {
      api.challengeHeartbeat(sessionId).catch(() => {});
    }, HB_MS);

    return () => clearInterval(hbRef.current);
  }, [sessionId]);

  function handleAnswersSubmitted(updatedSession) {
    setSession(updatedSession);
  }

  function handleExchangeComplete(updatedSession) {
    setSession(updatedSession);
  }

  function handleEvaluationDone(updatedSession) {
    setSession(updatedSession);
    navigate(`/app/challenge/complete/${sessionId}`, { replace: true });
  }

  if (loading || !session) {
    return (
      <div className="ch-session-page">
        <div className="ch-session-loading">
          <IconSpinner />
          <p>Loading challenge…</p>
        </div>
      </div>
    );
  }

  // Redirect if already done
  if (session.status === "completed" || session.status === "failed") {
    navigate(`/app/challenge/complete/${sessionId}`, { replace: true });
    return null;
  }
  if (session.status === "cancelled") {
    return (
      <div className="ch-session-page">
        <div className="ch-session-cancelled">
          <h3>Session Cancelled</h3>
          <p>This challenge session was cancelled.</p>
          <button className="ch-btn-secondary" onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    );
  }

  const partner = session.myRole === "initiator" ? session.partner : session.initiator;
  const phase   = session.status; // questions | peer_exchange | evaluating

  const PHASE_STEPS = [
    { key: "questions",     label: "Questions" },
    { key: "peer_exchange", label: "Peer Exchange" },
    { key: "evaluating",    label: "Evaluation" },
  ];
  const currentPhaseIdx = PHASE_STEPS.findIndex(p => p.key === phase);

  return (
    <div className="ch-session-page">
      {/* Top bar */}
      <div className="ch-session-topbar">
        <div className="ch-session-meta">
          <div className="ch-session-title">Challenge Session</div>
          <div className="ch-session-with">
            with {partner?.displayName || "Partner"}
          </div>
        </div>
        <div className="ch-phase-bar">
          {PHASE_STEPS.map((p, i) => (
            <div
              key={p.key}
              className={`ch-phase-step ${i < currentPhaseIdx ? "done" : ""} ${i === currentPhaseIdx ? "active" : ""}`}
            >
              <div className="ch-phase-dot">{i < currentPhaseIdx ? <IconCheck /> : i + 1}</div>
              <div className="ch-phase-label">{p.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Phase content */}
      <div className="ch-session-body">
        {phase === "questions" && (
          <QuestionsPhase session={session} onAnswersSubmitted={handleAnswersSubmitted} />
        )}
        {phase === "peer_exchange" && (
          <PeerExchangePhase session={session} onExchangeComplete={handleExchangeComplete} />
        )}
        {phase === "evaluating" && (
          <EvaluatingPhase session={session} onEvaluationDone={handleEvaluationDone} />
        )}
      </div>
    </div>
  );
}
