import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";

export default function AILearningRoom() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [userMessage, setUserMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [teaching, setTeaching] = useState(false);
  const [studyPeriod, setStudyPeriod] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [questions, setQuestions] = useState([]);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [answerInput, setAnswerInput] = useState({});
  const [reteaching, setReteaching] = useState(false);
  const [summarizing, setSummarizing] = useState(false);

  useEffect(() => {
    loadSession();
  }, [sessionId]);

  const loadSession = async () => {
    setLoading(true);
    try {
      const data = await api.getLearningSession(parseInt(sessionId, 10));
      setSession(data);
      if (data.questions) setQuestions(data.questions);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [session?.messages]);

  useEffect(() => {
    if (!studyPeriod || studyPeriod.timerStatus !== "active") return;
    const intervalId = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(intervalId);
          handleFinishStudy();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalId);
  }, [studyPeriod]);

  const handleTeach = async () => {
    if (teaching) return;
    setTeaching(true);
    setError("");
    try {
      const result = await api.teachConcept(parseInt(sessionId, 10));
      await loadSession();
    } catch (err) {
      setError(err.message);
    } finally {
      setTeaching(false);
    }
  };

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!userMessage.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      await api.sendStudentMessage(parseInt(sessionId, 10), userMessage);
      setUserMessage("");
      await loadSession();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleStartStudy = async () => {
    setError("");
    try {
      const period = await api.startStudyPeriod(parseInt(sessionId, 10), 300);
      setStudyPeriod(period);
      setTimerSeconds(period.durationSeconds);
      await loadSession();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleFinishStudy = async () => {
    if (!studyPeriod) return;
    setError("");
    try {
      await api.finishStudyPeriod(parseInt(sessionId, 10), studyPeriod.id);
      setStudyPeriod(null);
      setTimerSeconds(0);
      await loadSession();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGenerateQuestions = async () => {
    if (generatingQuestions) return;
    setGeneratingQuestions(true);
    setError("");
    try {
      const qs = await api.generateRetrievalQuestions(parseInt(sessionId, 10), 3);
      setQuestions([...questions, ...qs]);
      await loadSession();
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingQuestions(false);
    }
  };

  const handleSubmitAnswer = async (question) => {
    const answer = answerInput[question.id];
    if (!answer?.trim() || submittingAnswer) return;
    setSubmittingAnswer(true);
    setError("");
    try {
      await api.submitAnswer(parseInt(sessionId, 10), question.id, answer, null);
      setAnswerInput({ ...answerInput, [question.id]: "" });
      await loadSession();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingAnswer(false);
    }
  };

  const handleReteach = async () => {
    if (reteaching) return;
    setReteaching(true);
    setError("");
    try {
      await api.requestReteach(parseInt(sessionId, 10), "Student requested different approach");
      await loadSession();
    } catch (err) {
      setError(err.message);
    } finally {
      setReteaching(false);
    }
  };

  const handleSummarize = async () => {
    if (summarizing) return;
    setSummarizing(true);
    setError("");
    try {
      await api.generateSessionSummary(parseInt(sessionId, 10));
      await loadSession();
    } catch (err) {
      setError(err.message);
    } finally {
      setSummarizing(false);
    }
  };

  if (loading) {
    return (
      <div className="ai-learning-room">
        <div className="ai-learn-container">
          <div className="loading-spinner">Loading session...</div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="ai-learning-room">
        <div className="ai-learn-container">
          <div className="error-banner">Session not found.</div>
          <button className="ai-btn-secondary" onClick={() => navigate("/app/learn/ai")}>
            Back to Learn Home
          </button>
        </div>
      </div>
    );
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <div className="ai-learning-room">
      <div className="ai-room-header">
        <button className="ai-back-btn" onClick={() => navigate("/app/learn/ai")}>
          ← Exit Session
        </button>
        <div className="ai-room-title">
          <h1>{session.conceptName || "Learning Session"}</h1>
          <span className={`ai-session-status status-${session.status}`}>
            {session.status}
          </span>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="ai-room-body">
        <div className="ai-room-main">
          <div className="ai-messages">
            {session.messages && session.messages.length > 0 ? (
              session.messages.map((msg) => (
                <div key={msg.id} className={`ai-message ai-message-${msg.role}`}>
                  <div className="ai-message-avatar">
                    {msg.role === "ai" ? "🤖" : msg.role === "student" ? "👤" : "ℹ️"}
                  </div>
                  <div className="ai-message-content">
                    <div className="ai-message-text">{msg.content}</div>
                    {msg.messageType && (
                      <span className="ai-message-type">{msg.messageType}</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="ai-empty-state">No messages yet.</div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {session.status === "created" && (
            <div className="ai-room-actions">
              <button
                className="ai-btn-primary"
                onClick={handleTeach}
                disabled={teaching}
              >
                {teaching ? "Teaching..." : "Start Teaching"}
              </button>
            </div>
          )}

          {session.status === "teaching" && (
            <div className="ai-room-actions">
              <button
                className="ai-btn-primary"
                onClick={handleStartStudy}
                disabled={!!studyPeriod}
              >
                Start Study Timer
              </button>
              <button className="ai-btn-secondary" onClick={handleReteach} disabled={reteaching}>
                {reteaching ? "Reteaching..." : "Try Different Approach"}
              </button>
            </div>
          )}

          {session.status === "studying" && studyPeriod && (
            <div className="ai-study-timer">
              <div className="ai-timer-display">{formatTime(timerSeconds)}</div>
              <p>Study the material above. Timer will notify you when it's time for retrieval practice.</p>
              <button className="ai-btn-secondary" onClick={handleFinishStudy}>
                Finish Early
              </button>
            </div>
          )}

          {session.status === "retrieval" && (
            <div className="ai-room-actions">
              <button
                className="ai-btn-primary"
                onClick={handleGenerateQuestions}
                disabled={generatingQuestions}
              >
                {generatingQuestions ? "Generating..." : "Generate Retrieval Questions"}
              </button>
              {questions.length > 0 && (
                <button className="ai-btn-secondary" onClick={handleSummarize} disabled={summarizing}>
                  {summarizing ? "Generating..." : "Finish & Summarize"}
                </button>
              )}
            </div>
          )}

          {["teaching", "studying", "retrieval", "reteaching"].includes(session.status) && (
            <form className="ai-chat-input" onSubmit={handleSendMessage}>
              <input
                type="text"
                placeholder="Ask your tutor anything..."
                value={userMessage}
                onChange={(e) => setUserMessage(e.target.value)}
                disabled={sending}
              />
              <button type="submit" disabled={sending || !userMessage.trim()}>
                Send
              </button>
            </form>
          )}

          {session.status === "completed" && session.summary && (
            <div className="ai-summary-card">
              <h2>Session Summary</h2>
              <p>{session.summary.summaryText}</p>
              {session.summary.keyIdeas && session.summary.keyIdeas.length > 0 && (
                <div className="ai-summary-section">
                  <h3>Key Ideas</h3>
                  <ul>
                    {session.summary.keyIdeas.map((idea, i) => (
                      <li key={i}>{idea}</li>
                    ))}
                  </ul>
                </div>
              )}
              {session.summary.overallScore !== null && (
                <div className="ai-summary-score">
                  Final Score: {session.summary.overallScore}%
                </div>
              )}
            </div>
          )}
        </div>

        {questions.length > 0 && (
          <div className="ai-room-sidebar">
            <h2>Retrieval Questions</h2>
            {questions.map((q) => (
              <div key={q.id} className="ai-question-card">
                <p className="ai-question-text">{q.question}</p>
                <span className="ai-question-type">{q.questionType}</span>
                {q.options && (
                  <div className="ai-question-options">
                    {q.options.map((opt, i) => (
                      <label key={i} className="ai-option-label">
                        <input
                          type="radio"
                          name={`q-${q.id}`}
                          value={opt.label}
                          onChange={(e) =>
                            setAnswerInput({ ...answerInput, [q.id]: e.target.value })
                          }
                        />
                        {opt.label}. {opt.text}
                      </label>
                    ))}
                  </div>
                )}
                {!q.options && (
                  <textarea
                    className="ai-answer-input"
                    placeholder="Your answer..."
                    value={answerInput[q.id] || ""}
                    onChange={(e) =>
                      setAnswerInput({ ...answerInput, [q.id]: e.target.value })
                    }
                    rows={3}
                  />
                )}
                <button
                  className="ai-btn-small"
                  onClick={() => handleSubmitAnswer(q)}
                  disabled={submittingAnswer || !answerInput[q.id]?.trim()}
                >
                  Submit Answer
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
