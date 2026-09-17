import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import * as api from "../../api";

export default function AILearnHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [subjects, setSubjects] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.getSubjects().catch(() => []),
      api.listLearningSessions({ limit: 5 }).catch(() => []),
    ])
      .then(([subj, sess]) => {
        setSubjects(subj || []);
        setSessions(sess || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="ai-learn-home">
        <div className="ai-learn-container">
          <div className="loading-spinner">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-learn-home">
      <div className="ai-learn-container">
        <header className="ai-learn-header">
          <h1>What would you like to learn today?</h1>
          <p className="ai-learn-subtitle">
            Your AI tutor is ready. Choose a subject to begin.
          </p>
        </header>

        {error && <div className="error-banner">{error}</div>}

        {sessions.length > 0 && (
          <section className="ai-learn-section">
            <h2 className="ai-section-title">Continue Learning</h2>
            <div className="ai-session-list">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  className="ai-session-card"
                  onClick={() => navigate(`/app/learn/ai/session/${s.id}`)}
                >
                  <div className="ai-session-card-header">
                    <span className="ai-session-subject">{s.subjectName}</span>
                    <span className={`ai-session-status status-${s.status}`}>
                      {s.status}
                    </span>
                  </div>
                  <h3 className="ai-session-concept">{s.conceptName}</h3>
                  <p className="ai-session-topic">{s.topicName}</p>
                  {s.overallScore !== null && (
                    <div className="ai-session-score">Score: {s.overallScore}%</div>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="ai-learn-section">
          <h2 className="ai-section-title">All Subjects</h2>
          <div className="ai-subject-grid">
            {subjects.map((subj) => (
              <button
                key={subj.id}
                className="ai-subject-card"
                onClick={() => navigate(`/app/learn/ai/subject/${subj.id}`)}
              >
                {subj.icon && <span className="ai-subject-icon">{subj.icon}</span>}
                <h3 className="ai-subject-name">{subj.name}</h3>
                {subj.description && (
                  <p className="ai-subject-desc">{subj.description}</p>
                )}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
