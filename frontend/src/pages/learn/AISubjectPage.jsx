import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import * as api from "../../api";

export default function AISubjectPage() {
  const { subjectId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState(null);
  const [topics, setTopics] = useState([]);

  useEffect(() => {
    Promise.all([
      api.getSubject(subjectId),
      api.getTopics(subjectId),
    ])
      .then(([subj, top]) => {
        setSubject(subj);
        setTopics(top || []);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [subjectId]);

  if (loading) {
    return (
      <div className="ai-learn-page">
        <div className="ai-page-header">
          <div className="skeleton skeleton-text" style={{ width: "150px", height: "32px" }} />
          <div className="skeleton skeleton-text" style={{ width: "300px", height: "18px", marginTop: "8px" }} />
        </div>
        <div className="ai-learn-grid">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton skeleton-card" style={{ height: "200px" }} />
          ))}
        </div>
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="ai-learn-page">
        <div className="ai-empty-state">
          <p className="ai-empty-text">Subject not found.</p>
          <button className="ai-btn-secondary" onClick={() => navigate("/app/learn/ai")}>
            Back to AI Learning
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-learn-page">
      <button className="ai-back-btn" onClick={() => navigate("/app/learn/ai")}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <div className="ai-page-header">
        <div className="ai-header-left">
          <div className="ai-subject-icon-large">{subject.icon || "📚"}</div>
          <div>
            <h1 className="ai-page-title">{subject.name}</h1>
            <p className="ai-page-subtitle">{subject.description}</p>
          </div>
        </div>
      </div>

      <section className="ai-learn-section">
        <h2 className="ai-section-title">Topics</h2>
        {topics.length === 0 ? (
          <div className="ai-empty-state">
            <p className="ai-empty-text">No topics have been added yet.</p>
          </div>
        ) : (
          <div className="ai-topics-list">
            {topics.map(topic => (
              <div
                key={topic.id}
                className="ai-topic-card"
                onClick={() => navigate(`/app/learn/ai/subject/${subjectId}/topic/${topic.id}`)}
              >
                <div className="ai-topic-header">
                  <h3 className="ai-topic-name">{topic.name}</h3>
                  <div className={`ai-difficulty-badge difficulty-${topic.difficulty}`}>
                    {topic.difficulty}
                  </div>
                </div>
                <p className="ai-topic-desc">{topic.description}</p>
                <div className="ai-topic-footer">
                  <span className="ai-topic-meta">{topic.conceptCount || 0} concepts</span>
                  {topic.objectiveCount > 0 && (
                    <span className="ai-topic-meta">{topic.objectiveCount} learning objectives</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
