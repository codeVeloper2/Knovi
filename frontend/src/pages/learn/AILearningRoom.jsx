import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import * as api from "../../api";

export default function AILearningRoom() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [currentState, setCurrentState] = useState("welcome"); // welcome, intent_selection, teaching, study, retrieval, evaluation, reteaching, summary
  const [userInput, setUserInput] = useState("");
  const [sending, setSending] = useState(false);
  const [studyTimer, setStudyTimer] = useState(null);
  const [studyPeriodId, setStudyPeriodId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const messagesEndRef = useRef(null);
  const timerIntervalRef = useRef(null);

  useEffect(() => {
    loadSession();
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [sessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  async function loadSession() {
    try {
      const sess = await api.getAISession(sessionId);
      setSession(sess);
      
      // Load existing messages
      const msgs = await api.getSessionMessages(sessionId);
      setMessages(msgs || []);
      
      // Determine current state based on session
      if (sess.status === "completed") {
        setCurrentState("summary");
      } else if (msgs.length === 0) {
        setCurrentState("intent_selection");
      } else {
        // Determine state from last message or session phase
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg?.messageType === "teaching") {
          setCurrentState("teaching");
        } else {
          setCurrentState("teaching");
        }
      }
      setLoading(false);
    } catch (err) {
      alert(err.message || "Failed to load session");
      setLoading(false);
    }
  }

  async function handleIntent(intent) {
    setSending(true);
    try {
      let response;
      if (intent === "teach") {
        response = await api.teachConcept(sessionId);
      } else {
        response = await api.sendStudentMessage(sessionId, intent);
      }
      
      if (response.message) {
        setMessages(prev => [...prev, response.message]);
      }
      setCurrentState("teaching");
    } catch (err) {
      alert(err.message || "Failed to process request");
    } finally {
      setSending(false);
    }
  }

  async function handleSendMessage() {
    if (!userInput.trim() || sending) return;
    
    const userMsg = {
      role: "student",
      content: userInput,
      messageType: "question",
      createdAt: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, userMsg]);
    setUserInput("");
    setSending(true);
    
    try {
      const response = await api.sendStudentMessage(sessionId, userInput);
      if (response.message) {
        setMessages(prev => [...prev, response.message]);
      }
    } catch (err) {
      alert(err.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  async function handleStartStudy() {
    try {
      const response = await api.startStudyPeriod(sessionId, 300); // 5 minutes default
      setStudyTimer(response.durationSeconds || 300);
      setStudyPeriodId(response.studyPeriodId);
      setCurrentState("study");
      
      // Start countdown
      timerIntervalRef.current = setInterval(() => {
        setStudyTimer(prev => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current);
            handleStudyComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      alert(err.message || "Failed to start study period");
    }
  }

  async function handleStudyComplete() {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    
    try {
      if (studyPeriodId) {
        await api.finishStudyPeriod(sessionId, studyPeriodId);
      }
      setCurrentState("study_complete");
    } catch (err) {
      console.error("Failed to finish study period:", err);
      setCurrentState("study_complete");
    }
  }

  async function handleStartRetrieval() {
    setSending(true);
    try {
      const response = await api.generateRetrievalQuestions(sessionId, 3);
      setQuestions(response.questions || []);
      setCurrentQuestionIndex(0);
      setAnswer("");
      setCurrentState("retrieval");
    } catch (err) {
      alert(err.message || "Failed to generate questions");
    } finally {
      setSending(false);
    }
  }

  async function handleSubmitAnswer() {
    if (!answer.trim() || submitting) return;
    
    const currentQuestion = questions[currentQuestionIndex];
    setSubmitting(true);
    
    try {
      const response = await api.submitAnswer(
        sessionId,
        currentQuestion.id,
        answer,
        null
      );
      
      // Show evaluation
      if (response.evaluation) {
        setMessages(prev => [...prev, {
          role: "tutor",
          content: response.evaluation.feedback,
          messageType: "evaluation",
          createdAt: new Date().toISOString(),
        }]);
      }
      
      // Check if reteaching needed
      if (response.needsReteaching) {
        setCurrentState("reteaching");
        // Trigger reteaching
        const reteach = await api.generateAdaptiveReteach(sessionId);
        if (reteach.message) {
          setMessages(prev => [...prev, reteach.message]);
        }
      } else if (currentQuestionIndex < questions.length - 1) {
        // Next question
        setCurrentQuestionIndex(prev => prev + 1);
        setAnswer("");
      } else {
        // All questions done
        handleGenerateSummary();
      }
    } catch (err) {
      alert(err.message || "Failed to submit answer");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGenerateSummary() {
    setSending(true);
    try {
      const response = await api.generateSessionSummary(sessionId);
      if (response.summary) {
        setSession(prev => ({ ...prev, summary: response.summary }));
      }
      setCurrentState("summary");
    } catch (err) {
      alert(err.message || "Failed to generate summary");
    } finally {
      setSending(false);
    }
  }

  async function handleEndSession() {
    if (confirm("Are you sure you want to end this session?")) {
      try {
        await api.completeAISession(sessionId);
        navigate("/app/learn/ai");
      } catch (err) {
        alert(err.message || "Failed to end session");
      }
    }
  }

  if (loading) {
    return (
      <div className="ai-learning-room">
        <div className="ai-room-topbar">
          <div className="skeleton skeleton-text" style={{ width: "150px", height: "24px" }} />
        </div>
        <div className="ai-room-content">
          <div className="skeleton skeleton-text" style={{ width: "80%", height: "60px", margin: "20px 0" }} />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="ai-learning-room">
        <div className="ai-empty-state">
          <p className="ai-empty-text">Session not found.</p>
          <button className="ai-btn-secondary" onClick={() => navigate("/app/learn/ai")}>
            Back to AI Learning
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-learning-room">
      {/* Top Bar */}
      <div className="ai-room-topbar">
        <button className="ai-room-back" onClick={() => navigate("/app/learn/ai")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="ai-room-info">
          <h1 className="ai-room-title">AI Learning</h1>
          <p className="ai-room-meta">
            {session.subjectName} · {session.topicName}
          </p>
        </div>
        <div className="ai-room-status">
          <span className={`status-badge status-${session.status}`}>
            {formatStatus(session.status)}
          </span>
        </div>
        <button className="ai-btn-danger-outline ai-btn-small" onClick={handleEndSession}>
          End Session
        </button>
      </div>

      {/* Main Content */}
      <div className="ai-room-content">
        <div className="ai-room-messages">
          {/* Messages */}
          {messages.map((msg, idx) => (
            <div key={idx} className={`ai-message ${msg.role === "tutor" ? "ai-message-tutor" : "ai-message-student"}`}>
              {msg.role === "tutor" && (
                <div className="ai-message-avatar">
                  <svg width="32" height="32" viewBox="0 0 120 120" fill="none">
                    <circle cx="60" cy="60" r="50" fill="url(#grad3)" />
                    <circle cx="45" cy="50" r="6" fill="#fff" />
                    <circle cx="75" cy="50" r="6" fill="#fff" />
                    <path d="M40 70 Q60 80 80 70" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" />
                    <defs>
                      <linearGradient id="grad3" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#4f6ef7" />
                        <stop offset="100%" stopColor="#6366f1" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              )}
              <div className="ai-message-content">
                {msg.role === "tutor" && <div className="ai-message-label">PeerUp AI</div>}
                <div className="ai-message-text">
                  <MessageContent content={msg.content} />
                </div>
              </div>
            </div>
          ))}

          {/* Intent Selection */}
          {currentState === "intent_selection" && (
            <div className="ai-intent-section">
              <h2 className="ai-intent-title">What would you like to do first?</h2>
              <div className="ai-intent-options">
                <button className="ai-intent-btn" onClick={() => handleIntent("teach")} disabled={sending}>
                  <span className="ai-intent-icon">📚</span>
                  <span>Teach me this</span>
                </button>
                <button className="ai-intent-btn" onClick={() => handleIntent("explain_simply")} disabled={sending}>
                  <span className="ai-intent-icon">💡</span>
                  <span>Explain it simply</span>
                </button>
                <button className="ai-intent-btn" onClick={() => handleIntent("give_examples")} disabled={sending}>
                  <span className="ai-intent-icon">📝</span>
                  <span>Give me examples</span>
                </button>
                <button className="ai-intent-btn" onClick={() => handleIntent("broaden")} disabled={sending}>
                  <span className="ai-intent-icon">🌐</span>
                  <span>Broaden this</span>
                </button>
                <button className="ai-intent-btn" onClick={() => handleIntent("go_deeper")} disabled={sending}>
                  <span className="ai-intent-icon">🔬</span>
                  <span>Go deeper</span>
                </button>
                <button className="ai-intent-btn" onClick={() => handleIntent("quiz_me")} disabled={sending}>
                  <span className="ai-intent-icon">✅</span>
                  <span>Quiz me</span>
                </button>
              </div>
              <div className="ai-intent-custom">
                <input
                  type="text"
                  className="ai-intent-input"
                  placeholder="Ask your own question..."
                  value={userInput}
                  onChange={e => setUserInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSendMessage()}
                />
                <button className="ai-btn-primary" onClick={handleSendMessage} disabled={sending || !userInput.trim()}>
                  Ask
                </button>
              </div>
            </div>
          )}

          {/* Teaching State Actions */}
          {currentState === "teaching" && !sending && (
            <div className="ai-teaching-actions">
              <button className="ai-action-btn" onClick={handleStartStudy}>
                Start Study Period
              </button>
              <button className="ai-action-btn-outline" onClick={() => handleIntent("show_example")}>
                Show an example
              </button>
              <button className="ai-action-btn-outline" onClick={() => handleIntent("explain_differently")}>
                Explain differently
              </button>
              <button className="ai-action-btn-outline" onClick={() => handleIntent("make_simpler")}>
                Make it simpler
              </button>
            </div>
          )}

          {/* Study Timer */}
          {currentState === "study" && studyTimer !== null && (
            <div className="ai-study-timer">
              <h3 className="ai-study-title">Study this explanation</h3>
              <p className="ai-study-subtitle">Take a few minutes to understand the concept</p>
              <div className="ai-timer-display">
                <svg className="ai-timer-circle" viewBox="0 0 100 100">
                  <circle
                    className="ai-timer-bg"
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth="8"
                  />
                  <circle
                    className="ai-timer-progress"
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="#4f6ef7"
                    strokeWidth="8"
                    strokeDasharray="283"
                    strokeDashoffset={283 * (1 - studyTimer / 300)}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="ai-timer-text">
                  {formatTime(studyTimer)}
                </div>
              </div>
              {studyTimer < 60 && (
                <p className="ai-study-warning">Almost done. Finish reading the explanation.</p>
              )}
            </div>
          )}

          {/* Study Complete */}
          {currentState === "study_complete" && (
            <div className="ai-study-complete">
              <h3 className="ai-study-title">Study time is up.</h3>
              <p className="ai-study-subtitle">Let's see what you remember.</p>
              <button className="ai-btn-primary" onClick={handleStartRetrieval} disabled={sending}>
                Start Check
              </button>
            </div>
          )}

          {/* Retrieval Questions */}
          {currentState === "retrieval" && questions.length > 0 && (
            <div className="ai-retrieval-section">
              <div className="ai-question-header">
                <h3 className="ai-question-title">Question {currentQuestionIndex + 1} of {questions.length}</h3>
              </div>
              <div className="ai-question-card">
                <p className="ai-question-text">{questions[currentQuestionIndex].questionText}</p>
                <textarea
                  className="ai-answer-input"
                  placeholder="Type your answer here..."
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  rows={4}
                />
                <button
                  className="ai-btn-primary"
                  onClick={handleSubmitAnswer}
                  disabled={!answer.trim() || submitting}
                >
                  {submitting ? "Submitting..." : "Submit Answer"}
                </button>
              </div>
            </div>
          )}

          {/* Summary */}
          {currentState === "summary" && session.summary && (
            <div className="ai-summary-section">
              <h2 className="ai-summary-title">Session Complete</h2>
              <div className="ai-summary-card">
                <h3 className="ai-summary-subtitle">What you learned</h3>
                <p className="ai-summary-text">{session.summary.conceptCovered}</p>
                
                {session.summary.understood && (
                  <div className="ai-summary-item">
                    <h4 className="ai-summary-item-title">What you understood</h4>
                    <p>{session.summary.understood}</p>
                  </div>
                )}
                
                {session.summary.needsPractice && (
                  <div className="ai-summary-item">
                    <h4 className="ai-summary-item-title">What needs more practice</h4>
                    <p>{session.summary.needsPractice}</p>
                  </div>
                )}
                
                {session.summary.timeSpent && (
                  <div className="ai-summary-meta">
                    Time spent: {formatDuration(session.summary.timeSpent)}
                  </div>
                )}
              </div>
              
              <div className="ai-summary-actions">
                <button className="ai-btn-primary" onClick={() => navigate("/app/learn/ai")}>
                  Continue Learning
                </button>
                <button className="ai-btn-secondary" onClick={() => window.location.reload()}>
                  Practice Again
                </button>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input (for teaching/reteaching states) */}
        {(currentState === "teaching" || currentState === "reteaching") && (
          <div className="ai-room-input">
            <input
              type="text"
              className="ai-input-field"
              placeholder="Ask a question or request clarification..."
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSendMessage()}
            />
            <button
              className="ai-send-btn"
              onClick={handleSendMessage}
              disabled={sending || !userInput.trim()}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageContent({ content }) {
  // Simple markdown-like rendering
  return content.split("\n").map((line, i) => (
    <p key={i}>{line}</p>
  ));
}

function formatStatus(status) {
  const map = {
    active: "Active",
    in_progress: "In Progress",
    completed: "Completed",
    paused: "Paused",
  };
  return map[status] || status;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} minutes`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}
