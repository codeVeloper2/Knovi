/**
 * ChallengeStagePage — /app/study-rooms/session/:sessionId/challenge
 * Same structure as Practice but uses card-style options and challenge activities.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";
import { pickActivity, pickQuestions } from "./sessionUtils";
import StageBar from "./StageBar";
import QuestionCard from "./QuestionCard";

export default function ChallengeStagePage() {
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
  const activity = pickActivity(topic, "challenge");
  const questions = pickQuestions(topic, "challenge");
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

  function handleNext() {
    setResult(null); setAnswer(""); setShowHint(false);
    if (qIdx + 1 < questions.length) {
      setQIdx(qIdx + 1);
    } else {
      api.advanceSessionStage(Number(sessionId), "check").catch(() => {});
      navigate(`/app/study-rooms/session/${sessionId}/check`);
    }
  }

  return (
    <div className="ls-stage-page">
      <StageBar current="challenge" sessionId={sessionId} />
      <div className="ls-stage-topbar">
        <button className="ls-btn-ghost ls-btn-sm" onClick={() => navigate(-1)}>← Back</button>
        <span className="ls-stage-topbar-info">10 min · Question {qIdx + 1}/{questions.length}</span>
        <button className="ls-btn-ghost ls-btn-sm" onClick={() => navigate(`/app/study-rooms/session/${sessionId}/check`)}>
          Mark as Complete
        </button>
      </div>

      <div className="ls-stage-layout ls-stage-layout-single">
        <div className="ls-stage-label">
          <span className="ls-stage-num">5</span>
          <div>
            <p className="ls-stage-type">Challenge</p>
            <h2 className="ls-stage-title">{activity?.title || "Solve a Real-World Force Problem"}</h2>
            <span className="ls-stage-mins">10 min</span>
          </div>
        </div>

        {activity?.prompt && (
          <p className="ls-stage-prompt">{activity.prompt}</p>
        )}

        {!question ? (
          <div className="ls-empty-state">
            <p>No challenge questions available yet.</p>
            <button className="ls-btn-primary" onClick={() => navigate(`/app/study-rooms/session/${sessionId}/check`)}>
              Continue →
            </button>
          </div>
        ) : result ? (
          <div className={`ls-answer-result ${result.isCorrect ? "correct" : "incorrect"}`}>
            <div className="ls-answer-result-icon">{result.isCorrect ? "✓" : "✗"}</div>
            <p className="ls-answer-result-text">{result.isCorrect ? "Correct!" : "Not quite."}</p>
            {!result.isCorrect && result.hint && <p className="ls-answer-hint">{result.hint}</p>}
            <button className="ls-btn-primary" onClick={handleNext}>
              {qIdx + 1 < questions.length ? "Next →" : "Continue →"}
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
            optionStyle="card"
          />
        )}
        {error && <p className="ls-form-err">{error}</p>}
      </div>
    </div>
  );
}
