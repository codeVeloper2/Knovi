/**
 * StartSessionPage — /app/study-rooms/start
 * Shows all available curriculum topics. Admin selects one to start a session.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../../api";
import { estimateDuration, fmtDuration } from "./sessionUtils";

function SkeletonCard() {
  return (
    <div className="ls-topic-card ls-skeleton">
      <div className="ls-skeleton-line ls-sk-icon" />
      <div className="ls-skeleton-line ls-sk-title" />
      <div className="ls-skeleton-line ls-sk-sub" />
      <div className="ls-skeleton-line ls-sk-sub" />
    </div>
  );
}

function TopicCard({ topic, onStart, starting }) {
  const duration = fmtDuration(topic.estimatedMinutes ?? estimateDuration(topic.activitiesCount));

  return (
    <div className="ls-topic-card">
      <div className="ls-topic-card-header">
        <span className="ls-topic-subject-icon">{topic.subjectIcon || "📚"}</span>
        <span className="ls-topic-subject-name">{topic.subject || "—"}</span>
      </div>
      <h3 className="ls-topic-name">{topic.name}</h3>
      {topic.description && (
        <p className="ls-topic-desc">{topic.description}</p>
      )}
      <div className="ls-topic-stats">
        <span>🎯 {topic.objectivesCount ?? 0} Objectives</span>
        <span>💡 {topic.conceptsCount ?? 0} Concepts</span>
        <span>🎓 {topic.activitiesCount ?? 0} Activities</span>
        <span>❓ {topic.questionsCount ?? 0} Questions</span>
      </div>
      <div className="ls-topic-footer">
        <span className="ls-topic-duration">⏱ {duration}</span>
        {topic.difficulty && (
          <span className={`ls-diff-badge ls-diff-${topic.difficulty}`}>
            {topic.difficulty.charAt(0).toUpperCase() + topic.difficulty.slice(1)}
          </span>
        )}
      </div>
      <button
        className="ls-btn-primary ls-topic-start-btn"
        onClick={() => onStart(topic)}
        disabled={starting === topic.id}
      >
        {starting === topic.id ? "Starting…" : "Start Session"}
      </button>
    </div>
  );
}

export default function StartSessionPage() {
  const navigate = useNavigate();
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(null);
  const [filter, setFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("All");

  useEffect(() => {
    api.getLearningTopics()
      .then(setTopics)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleStart(topic) {
    setStarting(topic.id);
    try {
      const sess = await api.createLearningSession(topic.id);
      navigate(`/app/study-rooms/lobby/${sess.id}`);
    } catch (e) {
      setError(e.message);
      setStarting(null);
    }
  }

  const subjects = ["All", ...new Set(topics.map((t) => t.subject).filter(Boolean))];
  const displayed = topics.filter((t) => {
    const matchSubject = subjectFilter === "All" || t.subject === subjectFilter;
    const matchSearch = !filter || t.name.toLowerCase().includes(filter.toLowerCase());
    return matchSubject && matchSearch;
  });

  return (
    <div className="ls-page">
      {/* Page header */}
      <div className="ls-page-header">
        <div>
          <h1 className="ls-page-title">Start a Study Room</h1>
          <p className="ls-page-sub">Choose a topic to begin your learning session</p>
        </div>
      </div>

      {/* Search + subject filter */}
      <div className="ls-filters">
        <input
          className="ls-search-input"
          placeholder="🔍 Search for a topic…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="ls-subject-chips">
          {subjects.map((s) => (
            <button
              key={s}
              className={`ls-chip ${subjectFilter === s ? "active" : ""}`}
              onClick={() => setSubjectFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="ls-error-banner">
          <span>⚠️ {error}</span>
          <button className="ls-btn-ghost ls-btn-sm" onClick={() => {
            setError(""); setLoading(true);
            api.getLearningTopics().then(setTopics).catch((e) => setError(e.message)).finally(() => setLoading(false));
          }}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="ls-topic-grid">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : displayed.length === 0 ? (
        <div className="ls-empty-state">
          <span className="ls-empty-icon">📚</span>
          <p className="ls-empty-title">No topics available yet</p>
          <p className="ls-empty-sub">The curriculum is still being built. Check back soon.</p>
        </div>
      ) : (
        <div className="ls-topic-grid">
          {displayed.map((t) => (
            <TopicCard key={t.id} topic={t} onStart={handleStart} starting={starting} />
          ))}
        </div>
      )}
    </div>
  );
}
