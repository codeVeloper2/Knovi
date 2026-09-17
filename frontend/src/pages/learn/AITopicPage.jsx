import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import * as api from "../../api";

export default function AITopicPage() {
  const { subjectId, topicId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [topic, setTopic] = useState(null);
  const [concepts, setConcepts] = useState([]);

  useEffect(() => {
    Promise.all([
      api.getTopic(topicId),
      api.getConcepts(topicId),
    ])
      .then(([top, cons]) => {
        setTopic(top);
        setConcepts(cons || []);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [topicId]);

  if (loading) {
    return (
      <div className="ai-learn-page">
        <div className="ai-page-header">
          <div className="skeleton skeleton-text" style={{ width: "200px", height: "32px" }} />
          <div className="skeleton skeleton-text" style={{ width: "350px", height: "18px", marginTop: "8px" }} />
        </div>
        <div className="ai-concepts-list">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton skeleton-card" style={{ height: "140px" }} />
          ))}
        </div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="ai-learn-page">
        <div className="ai-empty-state">
          <p className="ai-empty-text">Topic not found.</p>
          <button className="ai-btn-secondary" onClick={() => navigate(`/app/learn/ai/subject/${subjectId}`)}>
            Back to Subject
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-learn-page">
      <button className="ai-back-btn" onClick={() => navigate(`/app/learn/ai/subject/${subjectId}`)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <div className="ai-page-header">
        <div className="ai-header-left">
          <div>
            <div className="ai-breadcrumb">
              <span className="ai-breadcrumb-link" onClick={() => navigate(`/app/learn/ai/subject/${subjectId}`)}>
                {topic.subjectName}
              </span>
              <span className="ai-breadcrumb-sep">›</span>
              <span>{topic.name}</span>
            </div>
            <h1 className="ai-page-title">{topic.name}</h1>
            <p className="ai-page-subtitle">{topic.description}</p>
          </div>
        </div>
        <div className={`ai-difficulty-badge difficulty-${topic.difficulty}`}>
          {topic.difficulty}
        </div>
      </div>

      <section className="ai-learn-section">
        <h2 className="ai-section-title">Concepts</h2>
        {concepts.length === 0 ? (
          <div className="ai-empty-state">
            <p className="ai-empty-text">No concepts are available for this topic yet.</p>
          </div>
        ) : (
          <div className="ai-concepts-list">
            {concepts.map(concept => (
              <div
                key={concept.id}
                className="ai-concept-card"
                onClick={() => navigate(`/app/learn/ai/subject/${subjectId}/topic/${topicId}/concept/${concept.id}`)}
              >
                <div className="ai-concept-header">
                  <h3 className="ai-concept-name">{concept.name}</h3>
                  {concept.learningStatus && (
                    <span className={`ai-status-dot status-${concept.learningStatus}`} />
                  )}
                </div>
                <p className="ai-concept-explanation">{concept.explanation}</p>
                {concept.progress !== undefined && (
                  <div className="ai-concept-progress">
                    <div className="ai-progress-bar">
                      <div 
                        className="ai-progress-fill" 
                        style={{ width: `${concept.progress}%` }} 
                      />
                    </div>
                    <span className="ai-progress-text">{concept.progress}% complete</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
