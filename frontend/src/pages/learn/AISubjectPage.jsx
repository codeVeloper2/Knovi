import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";

export default function AISubjectPage() {
  const { subjectId } = useParams();
  const navigate = useNavigate();
  const [subject, setSubject] = useState(null);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.getSubjectById(parseInt(subjectId, 10)),
      api.getTopicsBySubject(parseInt(subjectId, 10)),
    ])
      .then(([subj, tops]) => {
        setSubject(subj);
        setTopics(tops || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [subjectId]);

  if (loading) {
    return (
      <div className="ai-subject-page">
        <div className="ai-learn-container">
          <div className="loading-spinner">Loading topics...</div>
        </div>
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="ai-subject-page">
        <div className="ai-learn-container">
          <div className="error-banner">Subject not found.</div>
          <button className="ai-btn-secondary" onClick={() => navigate("/app/learn/ai")}>
            Back to Subjects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-subject-page">
      <div className="ai-learn-container">
        <button className="ai-back-btn" onClick={() => navigate("/app/learn/ai")}>
          ← Back to Subjects
        </button>

        <header className="ai-page-header">
          {subject.icon && <span className="ai-page-icon">{subject.icon}</span>}
          <h1>{subject.name}</h1>
          {subject.description && <p className="ai-page-desc">{subject.description}</p>}
        </header>

        {error && <div className="error-banner">{error}</div>}

        {topics.length === 0 ? (
          <div className="ai-empty-state">
            <p>No topics available yet for this subject.</p>
          </div>
        ) : (
          <div className="ai-topic-grid">
            {topics.map((topic) => (
              <button
                key={topic.id}
                className="ai-topic-card"
                onClick={() =>
                  navigate(`/app/learn/ai/subject/${subjectId}/topic/${topic.id}`)
                }
              >
                <h3 className="ai-topic-name">{topic.name}</h3>
                {topic.difficulty && (
                  <span className={`ai-topic-difficulty diff-${topic.difficulty}`}>
                    {topic.difficulty}
                  </span>
                )}
                {topic.description && (
                  <p className="ai-topic-desc">{topic.description}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
