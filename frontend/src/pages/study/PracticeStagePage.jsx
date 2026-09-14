/**
 * PracticeStagePage — /app/study-rooms/session/:sessionId/practice
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";
import { pickActivity, pickQuestions } from "./sessionUtils";
import StageBar from "./StageBar";
import QuestionCard from "./QuestionCard";

export default function PracticeStagePage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [qIdx, setQIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    api.getLearningSession(Number(sessionId))
      .then(setSession)
      .catch((e) => setError(e.message));
  }, [sessionId]);

  if (error) return <div className="ls-stage-error">⚠️ {error}</div>;
  if (!session) return <div className="ls-stage-loading"><div className="ls-loading-spinner" /></div>;

  const topic = session.topic || {};
  const activity = pickActivity(topic, "practice");
  const questions = pickQuestions(topic, "practice");
  const question = questions[qIdx];

  async function handleSubmit() {
    if (!answer.trim() || !question) return;
    setSubmitting(true);
    try {
      const r = await api.submitActivityResponse(Number(sessionId), activity?.id || question.activityId || 0, {
        response: answer,
        questionId: question.id,
      });
      setResult(r);
    } catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  }

  function handleNext() {
    setResult(null); setAnswer(""); setShowHint(false);
    if (qIdx + 1 < questions.length) {
      setQIdx(qIdx + 1);
    } else {
      api.advanceSessionStage(Number(sessionId), "challenge").catch(() => {});
      navigate(`/app/study-rooms/session/${sessionId}/challenge`);
    }
  }

  const totalQ = questions.length;

  return (
    <div className="ls-stage-page">
      <StageBar current="practice" sessionId={sessionId} />
      <div className="ls-stage-topbar">
        <button className="ls-btn-ghost ls-btn-sm" onClick={() => navigate(-1)}>← Back</button>
        <span className="ls-stage-topbar-info">8 min · Question {qIdx + 1}/{totalQ}</span>
        <button className="ls-btn-ghost ls-btn-sm" onClick={() => navigate(`/app/study-rooms/session/${sessionId}/challenge`)}>
          Mark as Complete
        </button>
      </div>

      <div className="ls-stage-layout ls-stage-layout-single">
        <div className="ls-stage-label">
          <span className="ls-stage-num">4</span>
          <div>
            <p className="ls-stage-type">Practice</p>
            <h2 className="ls-stage-title">{activity?.title || `Practice Questions`}</h2>
            <span className="ls-stage-mins">8 min</span>
          </div>
        </div>

        {!question ? (
          <div className="ls-empty-state">
            <p>No practice questions available for this topic yet.</p>
            <button className="ls-btn-primary" onClick={() => navigate(`/app/study-rooms/session/${sessionId}/challenge`)}>
              Continue →
            </button>
          </div>
        ) : result ? (
          <div className={`ls-answer-result ${result.isCorrect ? "correct" : "incorrect"}`}>
            <div className="ls-answer-result-icon">{result.isCorrect ? "✓" : "✗"}</div>
            <p className="ls-answer-result-text">{result.isCorrect ? "Correct!" : "Not quite."}</p>
            {!result.isCorrect && result.hint && <p className="ls-answer-hint">{result.hint}</p>}
            {!result.isCorrect && result.aiFeedback && <p className="ls-answer-explanation">{result.aiFeedback}</p>}
            <button className="ls-btn-primary" onClick={handleNext}>
              {qIdx + 1 < totalQ ? "Next Question →" : "Continue →"}
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
          />
        )}
        {error && <p className="ls-form-err">{error}</p>}
      </div>
    </div>
  );
}
