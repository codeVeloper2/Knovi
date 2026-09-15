/**
 * SoloAskPage — /app/solo/concepts/:conceptId/ask
 * Screen 4: Ask AI anything about this concept.
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

export default function SoloAskPage() {
  const { conceptId } = useParams();
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [conceptName, setConceptName] = useState("");
  const [topicId, setTopicId] = useState(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [suggestions, setSuggestions] = useState([]);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      api.soloGetLesson(conceptId),
      api.soloGetSuggestedQuestions(conceptId),
    ]).then(([lesson, sugs]) => {
      setConceptName(lesson.concept.name);
      setTopicId(lesson.topic.id);
      setProgress(lesson.progress);
      setSuggestions(sugs || []);
    }).catch(() => {}).finally(() => setInitLoading(false));
  }, [conceptId]);

  async function handleAsk(q) {
    const qText = (q || question).trim();
    if (!qText) return;
    setQuestion(qText);
    setLoading(true);
    setAnswer(null);
    setError(null);
    try {
      const res = await api.soloAskAI(conceptId, { question: qText });
      if (res.success) {
        setAnswer(res.answer);
      } else {
        setError(res.error?.message || "AI is temporarily unavailable.");
      }
    } catch {
      setError("Could not connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleSuggestion(s) {
    setQuestion(s);
    handleAsk(s);
  }

  const canContinue = progress?.checkpointPassed;

  if (initLoading) return (
    <div className="solo-shell">
      <div className="solo-loading"><div className="solo-spinner" />Loading…</div>
    </div>
  );

  return (
    <div className="solo-shell">
      <div className="solo-breadcrumb">
        <Link to="/app/solo">Learn</Link>
        <span className="bc-sep">›</span>
        <span className="bc-current">{conceptName}</span>
      </div>
      <StepTabs current="ask" />

      <div className="solo-content">
        {/* Left — Ask AI */}
        <div className="solo-card">
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
            Checkpoint 2 — {conceptName}
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>
            Have a remaining question?
          </h2>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
            Ask anything about this concept. Our AI will answer it for you.
          </div>

          <div className="ask-ai-input-row">
            <input
              ref={inputRef}
              className="ask-ai-input"
              placeholder="Type your question here…"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !loading && handleAsk()}
              maxLength={300}
            />
            <button
              className="btn-primary"
              style={{ padding: "12px 20px" }}
              onClick={() => handleAsk()}
              disabled={loading || !question.trim()}
            >
              {loading ? <div className="solo-spinner" style={{ width: 16, height: 16 }} /> : "Ask AI"}
            </button>
          </div>
          <div style={{ textAlign: "right", fontSize: 11, color: "#334155", marginTop: 4 }}>
            {question.length}/300
          </div>

          {error && (
            <div style={{ marginTop: 14, padding: "12px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, fontSize: 13, color: "#ef4444" }}>
              ⚠️ {error}
            </div>
          )}

          {answer && (
            <div className="ask-ai-answer">
              <div className="ai-badge" style={{ marginBottom: 8 }}>
                <div className="ai-badge-dot" />
                AI Answer
              </div>
              <p style={{ margin: 0 }}>{answer}</p>
            </div>
          )}

          <div className="btn-row" style={{ marginTop: 24 }}>
            <button className="btn-secondary" onClick={() => navigate(`/app/solo/concepts/${conceptId}/notes`)}>
              ← Back
            </button>
            {canContinue && (
              <button
                className="btn-primary"
                onClick={() => navigate(`/app/solo/concepts/${conceptId}/passed`)}
              >
                Next: Checkpoint Complete →
              </button>
            )}
          </div>
        </div>

        {/* Right — Suggested questions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="solo-card-sm">
            <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600, marginBottom: 12 }}>
              Suggested Questions
            </div>
            <div className="suggested-questions">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  className="suggested-q-btn"
                  onClick={() => handleSuggestion(s)}
                >
                  <span style={{ color: "#4f6ef7" }}>?</span>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
