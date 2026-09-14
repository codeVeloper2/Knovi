/**
 * CheckStagePage — /app/study-rooms/session/:sessionId/check
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";
import { pickActivity, pickQuestions } from "./sessionUtils";
import StageBar from "./StageBar";
import QuestionCard from "./QuestionCard";

export default function CheckStagePage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [qIdx, setQIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getLearningSession(Number(sessionId))
      .then(setSession)
      .catch((e) => setError(e.message));
  }, [sessionId]);

  if (error) return <div className="ls-stage-error">⚠️ {error}</div>;
  if (!session) return <div className="ls-stage-loading"><div className="ls-loading-spinner" /></div>;

  const topic = session.topic || {};
  const activity = pickActivity(topic, "check");
  const questions = pickQuestions(topic, "check");
  const question = questions[qIdx];

  async function handleSubmit() {
    if (!answer.trim() || !question) return;
    setSubmitting(true);
    try {
      const r = await api.submitActivityResponse(Number(sessionId), activity?.id || 0, {
        response: answer,
        questionId: question.id,
      });
      setResult(r);
    } catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  }

  async function handleNext() {
    setResult(null); setAnswer(""); setShowHint(false);
    if (qIdx + 1 < questions.length) {
      setQIdx(qIdx + 1);
    } else {
      // All done — complete session and go to summary
      try {
        await api.advanceSessionStage(Number(sessionId), "completed");
        await api.completeSession(Number(sessionId));
      } catch { /* ignore */ }
      navigate(`/app/study-rooms/session/${sessionId}/summary`);
    }
  }

  return (
    <div className="ls-stage-page">
      <StageBar current="check" sessionId={sessionId} />
      <div className="ls-stage-topbar">
        <button className="ls-btn-ghost ls-btn-sm" onClick={() => navigate(-1)}>← Back</button>
        <span className="ls-stage-topbar-info">7 min · Question {qIdx + 1}/{questions.length}</span>
        <button className="ls-btn-ghost ls-btn-sm" onClick={async () => {
          try {
            await api.completeSession(Number(sessionId));
          } catch { /* ignore */ }
          navigate(`/app/study-rooms/session/${sessionId}/summary`);
        }}>
          Mark as Complete
        </button>
      </div>

      <div className="ls-stage-layout ls-stage-layout-single">
        <div className="ls-stage-label">
          <span className="ls-stage-num">6</span>
          <div>
            <p className="ls-stage-type">Check Your Understanding</p>
            <h2 className="ls-stage-title">{activity?.title || "Check Your Understanding"}</h2>
            <span className="ls-stage-mins">7 min</span>
          </div>
        </div>

        {!question ? (
          <div className="ls-empty-state">
            <p>No check questions available yet.</p>
            <button className="ls-btn-primary" onClick={handleNext}>Finish Session →</button>
          </div>
        ) : result ? (
          <div className={`ls-answer-result ${result.isCorrect ? "correct" : "incorrect"}`}>
            <div className="ls-answer-result-icon">{result.isCorrect ? "✓" : "✗"}</div>
            <p className="ls-answer-result-text">{result.isCorrect ? "Correct!" : "Not quite."}</p>
            {!result.isCorrect && result.hint && <p className="ls-answer-hint">{result.hint}</p>}
            <button className="ls-btn-primary" onClick={handleNext}>
              {qIdx + 1 < questions.length ? "Next Question →" : "Finish Session →"}
            </button>
          </div>
        ) : (
          <QuestionCard
            question={question}
            answer={answer}
            setAnswer={setAnswer}
            showHint={showHint}
            onToggleHint={() => setShowHint((s) => !s)}
            onSubmit={handleSubmit}
            submitting={submitting}
            optionStyle="radio"
          />
        )}
        {error && <p className="ls-form-err">{error}</p>}
      </div>
    </div>
  );
}
