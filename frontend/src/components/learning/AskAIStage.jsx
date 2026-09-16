/**
 * AskAIStage — Curriculum-bound Q&A with the AI tutor.
 * The AI only answers questions about the current concept.
 */
import { useState, useEffect, useRef } from "react";
import * as api from "../../api";

function IconSpinner() {
  return (
    <svg className="ls-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}
function IconSend() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
function IconBot() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" /><path d="M12 7v4" />
    </svg>
  );
}

export default function AskAIStage({ conceptId, progress, concept }) {
  const [question, setQuestion] = useState("");
  const [asking, setAsking]     = useState(false);
  const [history, setHistory]   = useState([]);
  const [error, setError]       = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    if (progress?.askAiQuestions?.length) {
      setHistory(progress.askAiQuestions);
    }
  }, [progress]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, asking]);

  const handleAsk = async () => {
    const q = question.trim();
    if (!q) return;
    setQuestion("");
    try {
      setAsking(true);
      setError(null);
      const res = await api.conceptAskAI(conceptId, { question: q });
      if (!res.ok) throw new Error(res.detail || "No response");
      setHistory(prev => [...prev, { question: q, answer: res.answer, timestamp: new Date().toISOString() }]);
    } catch (err) {
      setError(err.message || "AI is temporarily unavailable. Please try again.");
    } finally {
      setAsking(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  const conceptName = concept?.name || "this concept";

  return (
    <div className="ask-stage">
      {/* Header */}
      <div className="ask-header">
        <div className="ask-header-icon"><IconBot /></div>
        <div>
          <h2 className="ask-title">Ask About This Concept</h2>
          <p className="ask-subtitle">
            Ask anything about <strong>{conceptName}</strong>. Answers are grounded in the PeerUP curriculum.
          </p>
        </div>
      </div>

      {/* Chat history */}
      <div className="ask-messages">
        {history.length === 0 && !asking && (
          <div className="ask-empty">
            <p>No questions yet. Ask anything about <strong>{conceptName}</strong>.</p>
          </div>
        )}
        {history.map((qa, i) => (
          <div key={i} className="ask-qa-pair">
            <div className="ask-user-msg">
              <span className="ask-msg-label">You</span>
              <p>{qa.question}</p>
            </div>
            <div className="ask-ai-msg">
              <span className="ask-msg-label ask-msg-label-ai"><IconBot /> AI Tutor</span>
              <p>{qa.answer}</p>
            </div>
          </div>
        ))}
        {asking && (
          <div className="ask-typing">
            <IconSpinner /> <span>AI is thinking…</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && <div className="ls-error ask-error"><p>{error}</p></div>}

      {/* Input */}
      <div className="ask-input-row">
        <textarea
          className="ask-textarea"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={handleKey}
          placeholder={`Ask a question about ${conceptName}…`}
          rows={2}
          disabled={asking}
        />
        <button
          className="ask-send-btn"
          onClick={handleAsk}
          disabled={asking || !question.trim()}
          aria-label="Send question"
        >
          {asking ? <IconSpinner /> : <IconSend />}
        </button>
      </div>
      <p className="ask-hint">Press Enter to send · Shift+Enter for new line</p>
    </div>
  );
}
