/**
 * SoloCheckpointPage — /app/solo/concepts/:conceptId/checkpoint
 * Screen 2: Checkpoint questions.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";
import "./solo.css";

const STEP_TABS = [
  { key: "lesson", label: "Lesson" },
  { key: "checkpoint", label: "Check" },
  { key: "notes", label: "Notes" },
  { key: "ask", label: "Question" },
];

function StepTabs({ current }) {
  const order = STEP_TABS.map(s => s.key);
  const currentIdx = order.indexOf(current);
  return (
    <div className="solo-tabs">
      {STEP_TABS.map((s, i) => (
        <div key={s.key} className={`solo-tab ${s.key === current ? "active" : ""} ${i < currentIdx ? "done" : ""}`}>
          {i < currentIdx && <span className="solo-tab-check">✓</span>}
          {s.label}
        </div>
      ))}
    </div>
  );
}

function Timer() {
  const [seconds, setSeconds] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    ref.current = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(ref.current);
  }, []);
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return <span className="checkpoint-timer">⏱ {m}:{s}</span>;
}

export default function SoloCheckpointPage() {
  const { conceptId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [selected, setSelected] = useState({});      // { questionId: optionText }
  const [results, setResults] = useState({});        // { questionId: { isCorrect, correctAnswer, explanation, feedback } }
  const [submitting, setSubmitting] = useState(false);
  const [passed, setPassed] = useState(false);

  useEffect(() => {
    api.soloGetCheckpoint(conceptId)
      .then(d => {
        setData(d);
        if (d.checkpointPassed) setPassed(true);
        // Pre-fill already answered
        const preSelected = {};
        const preResults = {};
        for (const q of d.questions) {
          if (q.answered) {
            preSelected[q.id] = q.userAnswer;
            preResults[q.id] = { isCorrect: q.isCorrect, answered: true };
          }
        }
        setSelected(preSelected);
        setResults(preResults);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [conceptId]);

  if (loading) return (
    <div className="solo-shell">
      <div className="solo-loading"><div className="solo-spinner" />Loading checkpoint…</div>
    </div>
  );

  if (!data) return (
    <div className="solo-shell">
      <div className="solo-empty"><div className="solo-empty-icon">⚠️</div><p>Checkpoint not found.</p></div>
    </div>
  );

  const { questions, conceptName } = data;

  if (questions.length === 0) return (
    <div className="solo-shell">
      <div className="solo-empty">
        <div className="solo-empty-icon">✅</div>
        <p>No checkpoint questions for this concept yet.</p>
        <button className="btn-primary" onClick={() => navigate(`/app/solo/concepts/${conceptId}/notes`)}>
          Continue →
        </button>
      </div>
    </div>
  );

  const question = questions[currentQIdx];
  const totalQ = questions.length;
  const answeredCorrect = Object.values(results).filter(r => r.isCorrect).length;
  const hasResult = !!results[question?.id];
  const currentResult = results[question?.id];

  async function handleSubmit() {
    if (!selected[question.id]) return;
    setSubmitting(true);
    try {
      const res = await api.soloSubmitAnswer(conceptId, {
        question_id: question.id,
        response: selected[question.id],
      });
      setResults(prev => ({
        ...prev,
        [question.id]: {
          isCorrect: res.isCorrect,
          correctAnswer: res.correctAnswer,
          explanation: res.explanation,
          answered: true,
        },
      }));
      if (res.checkpointPassed) setPassed(true);
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    if (currentQIdx < totalQ - 1) {
      setCurrentQIdx(i => i + 1);
    } else if (passed) {
      navigate(`/app/solo/concepts/${conceptId}/notes`);
    } else {
      // Try Again — reset all state and reload questions
      setCurrentQIdx(0);
      setSelected({});
      setResults({});
      setPassed(false);
      setLoading(true);
      api.soloGetCheckpoint(conceptId)
        .then(d => {
          setData(d);
          if (d.checkpointPassed) setPassed(true);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }

  if (passed && currentQIdx === totalQ - 1 && hasResult) {
    return (
      <div className="solo-shell">
        <div className="solo-breadcrumb">
          <Link to="/app/solo">Learn</Link>
          <span className="bc-sep">›</span>
          <span className="bc-current">{conceptName}</span>
        </div>
        <StepTabs current="checkpoint" />
        <div style={{ padding: "0 24px 24px" }}>
          <div className="solo-card">
            <div className="checkpoint-passed-hero">
              <div className="checkpoint-passed-icon">✓</div>
              <div className="checkpoint-passed-title">Checkpoint Passed!</div>
              <div className="checkpoint-passed-sub">
                You answered {answeredCorrect} of {totalQ} correctly. Well done!
              </div>
              <button
                className="btn-primary"
                style={{ marginTop: 8 }}
                onClick={() => navigate(`/app/solo/concepts/${conceptId}/notes`)}
              >
                Next: Explain in Your Words →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="solo-shell">
      <div className="solo-breadcrumb">
        <Link to="/app/solo">Learn</Link>
        <span className="bc-sep">›</span>
        <span className="bc-current">{conceptName}</span>
      </div>

      <div className="solo-progress-strip">
        <span style={{ fontSize: 12 }}>Question {currentQIdx + 1} of {totalQ}</span>
        <div className="solo-progress-bar-wrap">
          <div className="solo-progress-bar-fill" style={{ width: `${((currentQIdx) / totalQ) * 100}%` }} />
        </div>
        <Timer />
      </div>

      <StepTabs current="checkpoint" />

      <div className="solo-content">
        <div className="solo-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div className="checkpoint-q-label">Checkpoint 2 — {conceptName}</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
            <div className="feedback-pill" style={{
              background: "rgba(79,110,247,0.12)", color: "#4f6ef7",
              fontWeight: 400, fontSize: 12,
            }}>
              Question {currentQIdx + 1} of {totalQ}
            </div>
          </div>

          <div className="checkpoint-q-text">{question.question}</div>

          {/* MCQ options */}
          {question.questionType === "multiple_choice" && question.options ? (
            <div className="checkpoint-options">
              {question.options.map(opt => {
                const val = opt.text;
                const isSelected = selected[question.id] === val;
                let cls = isSelected ? "selected" : "";
                if (hasResult) {
                  cls += " disabled";
                  if (val === currentResult.correctAnswer) cls += " correct";
                  else if (isSelected && !currentResult.isCorrect) cls += " wrong";
                }
                return (
                  <button
                    key={opt.label}
                    className={`checkpoint-option ${cls}`}
                    onClick={() => !hasResult && setSelected(prev => ({ ...prev, [question.id]: val }))}
                    disabled={hasResult}
                  >
                    <span className="checkpoint-option-label">{opt.label}</span>
                    {val}
                  </button>
                );
              })}
            </div>
          ) : (
            /* Short answer */
            <div>
              <input
                style={{
                  width: "100%", background: "#081325", border: "1.5px solid #1e293b",
                  borderRadius: 10, padding: "12px 14px", fontSize: 14, color: "#e2e8f0",
                  fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                }}
                placeholder="Type your answer…"
                value={selected[question.id] || ""}
                onChange={e => !hasResult && setSelected(prev => ({ ...prev, [question.id]: e.target.value }))}
                disabled={hasResult}
                onKeyDown={e => e.key === "Enter" && !hasResult && handleSubmit()}
              />
            </div>
          )}

          {/* Feedback after answer */}
          {hasResult && (
            <div style={{ marginTop: 16 }}>
              <div className={`feedback-pill ${currentResult.isCorrect ? "correct" : "wrong"}`}>
                {currentResult.isCorrect ? "✓ Correct!" : "✗ Incorrect"}
              </div>
              {!currentResult.isCorrect && currentResult.correctAnswer && (
                <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 6 }}>
                  Correct answer: <strong style={{ color: "#e2e8f0" }}>{currentResult.correctAnswer}</strong>
                </div>
              )}
              {currentResult.explanation && (
                <div className="quick-tip" style={{ marginTop: 10 }}>
                  <span className="quick-tip-icon">💡</span>
                  <div>{currentResult.explanation}</div>
                </div>
              )}
            </div>
          )}

          <div className="btn-row">
            {!hasResult ? (
              <button
                className="btn-primary"
                onClick={handleSubmit}
                disabled={!selected[question.id] || submitting}
              >
                {submitting ? "Checking…" : "Submit Answer"}
              </button>
            ) : (
              <>
                <button
                  className="btn-secondary"
                  onClick={() => navigate(`/app/solo/concepts/${conceptId}/lesson`)}
                >
                  ← Back
                </button>
                <button className="btn-primary" onClick={handleNext}>
                  {currentQIdx < totalQ - 1
                    ? "Next Question →"
                    : passed
                      ? "Next: Explain in Your Words →"
                      : "Try Again"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="solo-card-sm">
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>Quick Tips</div>
          <div className="quick-tip">
            <span className="quick-tip-icon">💡</span>
            <div>Read each option carefully before answering.</div>
          </div>
          <div style={{ marginTop: 14, fontSize: 13, color: "#64748b" }}>Progress</div>
          <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
            {questions.map((q, i) => (
              <div key={q.id} style={{
                width: 28, height: 28, borderRadius: 6,
                background: results[q.id]
                  ? (results[q.id].isCorrect ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)")
                  : (i === currentQIdx ? "rgba(79,110,247,0.2)" : "#1e293b"),
                border: i === currentQIdx ? "1.5px solid #4f6ef7" : "1px solid #1e293b",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, color: results[q.id]
                  ? (results[q.id].isCorrect ? "#22c55e" : "#ef4444")
                  : "#64748b",
              }}>
                {results[q.id] ? (results[q.id].isCorrect ? "✓" : "✗") : i + 1}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, fontSize: 12, color: "#64748b" }}>
            {answeredCorrect}/{totalQ} correct
          </div>
        </div>
      </div>
    </div>
  );
}
