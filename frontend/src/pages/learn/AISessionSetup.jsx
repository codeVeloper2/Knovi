import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import * as api from "../../api";

export default function AISessionSetup() {
  const { subjectId, topicId, conceptId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [concept, setConcept] = useState(null);
  const [familiarity, setFamiliarity] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [creating, setCreating] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  useEffect(() => {
    api.getConcept(conceptId)
      .then(con => {
        setConcept(con);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [conceptId]);

  async function handleStartSession() {
    if (!familiarity) return;
    setCreating(true);
    try {
      const session = await api.createAISession({
        conceptId: parseInt(conceptId),
        currentKnowledge: familiarity,
        studentContext: additionalContext.trim() || undefined,
      });
      setSessionId(session.id);
      setShowWelcome(true);
    } catch (err) {
      alert(err.message || "Failed to create session");
      setCreating(false);
    }
  }

  function handleEnterRoom() {
    if (sessionId) {
      navigate(`/app/learn/ai/session/${sessionId}`);
    }
  }

  if (loading) {
    return (
      <div className="ai-learn-page">
        <div className="ai-setup-container">
          <div className="skeleton skeleton-text" style={{ width: "250px", height: "28px" }} />
          <div className="skeleton skeleton-text" style={{ width: "400px", height: "18px", marginTop: "8px" }} />
        </div>
      </div>
    );
  }

  if (!concept) {
    return (
      <div className="ai-learn-page">
        <div className="ai-empty-state">
          <p className="ai-empty-text">Concept not found.</p>
          <button className="ai-btn-secondary" onClick={() => navigate(`/app/learn/ai/subject/${subjectId}/topic/${topicId}`)}>
            Back to Topic
          </button>
        </div>
      </div>
    );
  }

  if (showWelcome) {
    return (
      <div className="ai-learn-page">
        <div className="ai-welcome-container">
          <div className="ai-tutor-mascot-large">
            <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
              <circle cx="60" cy="60" r="50" fill="url(#grad2)" />
              <circle cx="45" cy="50" r="8" fill="#fff" />
              <circle cx="75" cy="50" r="8" fill="#fff" />
              <path d="M40 70 Q60 85 80 70" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" />
              <defs>
                <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#4f6ef7" />
                  <stop offset="100%" stopColor="#6366f1" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <div className="ai-welcome-content">
            <p className="ai-welcome-label">You're learning:</p>
            <h1 className="ai-welcome-title">{concept.name}</h1>
            <p className="ai-welcome-meta">{concept.subjectName} · {concept.topicName}</p>

            <div className="ai-welcome-divider" />

            <h2 className="ai-welcome-subtitle">Your AI tutor is ready.</h2>
            <p className="ai-welcome-text">
              I'll explain concepts in a way that matches what you already know, then check your understanding as we go.
            </p>
            <p className="ai-welcome-text">
              Be honest with your answers. Your tutor uses your responses to adjust how it teaches you.
            </p>

            <button className="ai-btn-primary ai-btn-large" onClick={handleEnterRoom} disabled={!sessionId}>
              Enter Learning Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-learn-page">
      <button className="ai-back-btn" onClick={() => navigate(`/app/learn/ai/subject/${subjectId}/topic/${topicId}`)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <div className="ai-setup-container">
        <div className="ai-setup-header">
          <h1 className="ai-setup-title">{concept.name}</h1>
          <p className="ai-setup-subtitle">{concept.explanation}</p>
          <p className="ai-setup-meta">{concept.subjectName} · {concept.topicName}</p>
        </div>

        <div className="ai-setup-card">
          <h2 className="ai-setup-question">How familiar are you with this?</h2>
          
          <div className="ai-familiarity-options">
            <button
              className={`ai-familiarity-btn ${familiarity === "completely_new" ? "active" : ""}`}
              onClick={() => setFamiliarity("completely_new")}
            >
              <div className="ai-familiarity-icon">🌱</div>
              <div>
                <div className="ai-familiarity-label">Completely new</div>
                <div className="ai-familiarity-desc">Start from the beginning</div>
              </div>
            </button>

            <button
              className={`ai-familiarity-btn ${familiarity === "seen_before" ? "active" : ""}`}
              onClick={() => setFamiliarity("seen_before")}
            >
              <div className="ai-familiarity-icon">👀</div>
              <div>
                <div className="ai-familiarity-label">Seen it before</div>
                <div className="ai-familiarity-desc">I've heard about this</div>
              </div>
            </button>

            <button
              className={`ai-familiarity-btn ${familiarity === "understand_basics" ? "active" : ""}`}
              onClick={() => setFamiliarity("understand_basics")}
            >
              <div className="ai-familiarity-icon">📖</div>
              <div>
                <div className="ai-familiarity-label">Understand the basics</div>
                <div className="ai-familiarity-desc">I know some of this</div>
              </div>
            </button>

            <button
              className={`ai-familiarity-btn ${familiarity === "know_well" ? "active" : ""}`}
              onClick={() => setFamiliarity("know_well")}
            >
              <div className="ai-familiarity-icon">✨</div>
              <div>
                <div className="ai-familiarity-label">Know it well</div>
                <div className="ai-familiarity-desc">Just need practice</div>
              </div>
            </button>

            <button
              className={`ai-familiarity-btn ${familiarity === "specific_help" ? "active" : ""}`}
              onClick={() => setFamiliarity("specific_help")}
            >
              <div className="ai-familiarity-icon">🎯</div>
              <div>
                <div className="ai-familiarity-label">I need help with something specific</div>
                <div className="ai-familiarity-desc">Target a particular aspect</div>
              </div>
            </button>
          </div>

          <div className="ai-setup-additional">
            <label className="ai-setup-label">Tell your tutor anything else</label>
            <textarea
              className="ai-setup-textarea"
              placeholder="e.g., I understand force but not acceleration..."
              value={additionalContext}
              onChange={e => setAdditionalContext(e.target.value)}
              rows={3}
            />
            <p className="ai-setup-hint">Optional, but helps your tutor adapt to you</p>
          </div>

          <button
            className="ai-btn-primary ai-btn-large"
            onClick={handleStartSession}
            disabled={!familiarity || creating}
          >
            {creating ? "Creating session..." : "Start AI Session"}
          </button>
        </div>
      </div>
    </div>
  );
}
