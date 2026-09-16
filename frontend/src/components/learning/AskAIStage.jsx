import { useState, useEffect, useRef } from "react";
import * as api from "../../api";

// Simple inline icon components
const Loader = () => (
  <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" opacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75" />
  </svg>
);

const Send = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const MessageCircle = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

/**
 * AskAIStage — Curriculum-bound Q&A with AI tutor
 */
export default function AskAIStage({ conceptId, progress }) {
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [qaHistory, setQaHistory] = useState([]);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    // Load existing Q&A history
    if (progress?.askAiQuestions) {
      setQaHistory(progress.askAiQuestions);
    }
  }, [progress]);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [qaHistory]);

  const handleAskQuestion = async () => {
    if (!question.trim()) {
      return;
    }

    const userQuestion = question.trim();
    setQuestion("");

    try {
      setAsking(true);
      setError(null);

      const response = await api.post(`/api/v1/concepts/${conceptId}/ask-ai`, {
        question: userQuestion,
      });
      
      if (!response.ok) {
        throw new Error(response.message || "Failed to get AI response");
      }

      // Add to local history immediately
      setQaHistory(prev => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          question: userQuestion,
          answer: response.answer,
        }
      ]);
    } catch (err) {
      console.error("Error asking AI:", err);
      setError(err.message || "Failed to get AI response. Please try again.");
    } finally {
      setAsking(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAskQuestion();
    }
  };

  return (
    <div className="ask-ai-stage">
      <div className="ask-ai-container">
        <div className="ask-ai-header">
          <MessageCircle size={32} />
          <div>
            <h2>Ask AI Questions</h2>
            <p>Ask questions about this concept. The AI will answer based on what you've learned.</p>
          </div>
        </div>

        {/* Chat History */}
        <div className="ask-ai-messages">
          {qaHistory.length === 0 ? (
            <div className="no-messages">
              <p>No questions yet. Ask something about the concept!</p>
            </div>
          ) : (
            qaHistory.map((qa, idx) => (
              <div key={idx} className="qa-pair">
                <div className="user-question">
                  <strong>You:</strong> {qa.question}
                </div>
                <div className="ai-answer">
                  <strong>AI Tutor:</strong> {qa.answer}
                </div>
              </div>
            ))
          )}
          {asking && (
            <div className="ai-typing">
              <Loader className="spinner" size={16} />
              <span>AI is thinking...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}

        {/* Input Area */}
        <div className="ask-ai-input">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask a question about this concept..."
            rows={3}
            className="question-textarea"
            disabled={asking}
          />
          <button
            onClick={handleAskQuestion}
            disabled={asking || !question.trim()}
            className="btn-primary send-button"
          >
            {asking ? (
              <Loader className="spinner" size={20} />
            ) : (
              <>
                <Send size={20} />
                <span>Ask</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
