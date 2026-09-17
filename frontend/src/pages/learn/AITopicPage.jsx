import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";

export default function AITopicPage() {
  const { subjectId, topicId } = useParams();
  const navigate = useNavigate();
  const [topic, setTopic] = useState(null);
  const [concepts, setConcepts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.getTopicById(parseInt(topicId, 10)),
      api.getConceptsByTopic(parseInt(topicId, 10)),
    ])
      .then(([t, concs]) => {
        setTopic(t);
        setConcepts(concs || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [topicId]);

  if (loading) {
    return (
      <div className="ai-topic-page">
        <div className="ai-learn-container">
          <div className="loading-spinner">Loading concepts...</div>
        </div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="ai-topic-page">
        <div className="ai-learn-container">
          <div className="error-banner">Topic not found.</div>
          <button
            className="ai-btn-secondary"
            onClick={() => navigate(`/app/learn/ai/subject/${subjectId}`)}
          >
            Back to Topics
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-topic-page">
      <div className="ai-learn-container">
        <button
          className="ai-back-btn"
          onClick={() => navigate(`/app/learn/ai/subject/${subjectId}`)}
        >
          ← Back to Topics
        </button>

        <header className="ai-page-header">
          <h1>{topic.name}</h1>
          {topic.difficulty && (
            <span className={`ai-topic-difficulty diff-${topic.difficulty}`}>
              {topic.difficulty}
            </span>
          )}
          {topic.description && <p className="ai-page-desc">{topic.description}</p>}
        </header>

        {error && <div className="error-banner">{error}</div>}

        {concepts.length === 0 ? (
          <div className="ai-empty-state">
            <p>No concepts available yet for this topic.</p>
          </div>
        ) : (
          <div className="ai-concept-list">
            {concepts.map((concept) => (
              <button
                key={concept.id}
                className="ai-concept-card"
                onClick={() =>
                  navigate(
                    `/app/learn/ai/subject/${subjectId}/topic/${topicId}/concept/${concept.id}`
                  )
                }
              >
                <h3 className="ai-concept-name">{concept.name}</h3>
                {concept.explanation && (
                  <p className="ai-concept-preview">
                    {concept.explanation.substring(0, 150)}
                    {concept.explanation.length > 150 ? "..." : ""}
                  </p>
                )}
                {concept.keyPoints && concept.keyPoints.length > 0 && (
                  <div className="ai-concept-points">
                    {concept.keyPoints.slice(0, 3).map((kp, i) => (
                      <span key={i} className="ai-key-point">
                        • {kp}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
