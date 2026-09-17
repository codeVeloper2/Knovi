import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../../api";

export default function AILearnHome() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);

  useEffect(() => {
    Promise.all([
      api.getSubjects().catch(() => []),
      api.getAISessions().catch(() => []),
    ]).then(([subj, sessions]) => {
      setSubjects(subj || []);
      const incomplete = (sessions || []).filter(s => s.status !== "completed").slice(0, 3);
      setRecentSessions(incomplete);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="ai-learn-page">
        <div className="ai-learn-hero">
          <div className="ai-learn-header skeleton skeleton-text" style={{ width: "200px", height: "36px" }} />
          <div className="skeleton skeleton-text" style={{ width: "400px", height: "20px", marginTop: "12px" }} />
        </div>
        <div className="ai-learn-grid">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton skeleton-card" style={{ height: "180px" }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="ai-learn-page">
      {/* Hero */}
      <div className="ai-learn-hero">
        <div className="ai-learn-hero-content">
          <h1 className="ai-learn-title">AI Learning</h1>
          <p className="ai-learn-subtitle">Learn any concept with a tutor that adapts to you.</p>
        </div>
        <div className="ai-tutor-mascot">
          <svg width="80" height="80" viewBox="0 0 120 120" fill="none">
            <circle cx="60" cy="60" r="50" fill="url(#grad1)" />
            <circle cx="45" cy="50" r="8" fill="#fff" />
            <circle cx="75" cy="50" r="8" fill="#fff" />
            <path d="M40 70 Q60 85 80 70" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" />
            <defs>
              <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4f6ef7" />
                <stop offset="100%" stopColor="#6366f1" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      {/* Continue Learning */}
      {recentSessions.length > 0 && (
        <section className="ai-learn-section">
          <h2 className="ai-section-title">Continue Learning</h2>
          <div className="ai-session-cards">
            {recentSessions.map(session => (
              <div
                key={session.id}
                className="ai-session-card"
                onClick={() => navigate(`/app/learn/ai/session/${session.id}`)}
              >
                <div className="ai-session-status">
                  <span className="status-badge status-in-progress">In Progress</span>
                </div>
                <h3 className="ai-session-concept">{session.conceptName || "Concept"}</h3>
                <p className="ai-session-meta">
                  {session.subjectName} · {session.topicName}
                </p>
                {session.currentPhase && (
                  <div className="ai-session-phase">
                    <div className="phase-dot" />
                    <span>{formatPhase(session.currentPhase)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Your Subjects */}
      <section className="ai-learn-section">
        <h2 className="ai-section-title">Your Subjects</h2>
        {subjects.length === 0 ? (
          <div className="ai-empty-state">
            <p className="ai-empty-text">No subjects available yet.</p>
          </div>
        ) : (
          <div className="ai-learn-grid">
            {subjects.map(subject => (
              <div
                key={subject.id}
                className="ai-subject-card"
                onClick={() => navigate(`/app/learn/ai/subject/${subject.id}`)}
              >
                <div className="ai-subject-icon">{subject.icon || "📚"}</div>
                <h3 className="ai-subject-name">{subject.name}</h3>
                <p className="ai-subject-desc">{subject.description}</p>
                <div className="ai-subject-footer">
                  <span className="ai-subject-topics">{subject.topicCount || 0} topics</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function formatPhase(phase) {
  const map = {
    intent_selection: "Getting started",
    teaching: "Learning",
    study: "Studying",
    retrieval: "Practice questions",
    reteaching: "Re-learning",
    summary: "Review",
  };
  return map[phase] || phase;
}
