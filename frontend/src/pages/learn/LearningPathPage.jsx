import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../../api";

export default function LearningPathPage() {
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.getSubjects().then(async result => {
      const list = Array.isArray(result) ? result : (result?.subjects || []);
      if (!alive) return;
      setSubjects(list);

      const pairs = await Promise.all(list.map(async subject => {
        try {
          const rows = await api.getTopics(subject.id);
          return [subject.id, Array.isArray(rows) ? rows.slice(0, 3) : []];
        } catch {
          return [subject.id, []];
        }
      }));
      if (alive) {
        setTopics(Object.fromEntries(pairs));
        setLoading(false);
      }
    }).catch(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  return (
    <div className="learn-secondary-page">
      <div className="learn-secondary-head">
        <div>
          <span className="learn-secondary-kicker">YOUR JOURNEY</span>
          <h1>Learning Path</h1>
          <p>A simple recommended route through the curriculum.</p>
        </div>
      </div>

      {loading ? (
        <div className="learn-path-grid">
          {[1,2,3].map(i => <div className="learn-path-card skeleton-row" key={i} />)}
        </div>
      ) : subjects.length === 0 ? (
        <div className="learn-empty">
          <span className="learn-empty-icon">🗺️</span>
          <h3>Your path is empty</h3>
          <p>Subjects and topics will appear here as the curriculum is added.</p>
        </div>
      ) : (
        <div className="learn-path-grid">
          {subjects.map((subject, index) => (
            <article key={subject.id} className="learn-path-card">
              <div className="learn-path-number">{String(index + 1).padStart(2, "0")}</div>
              <div className="learn-path-copy">
                <h2>{subject.name}</h2>
                <p>{subject.description || "Build your understanding one topic at a time."}</p>
                <div className="learn-path-topics">
                  {(topics[subject.id] || []).map(topic => (
                    <button
                      type="button"
                      key={topic.id}
                      onClick={() => navigate(`/app/learn/ai/subject/${subject.id}/topic/${topic.id}`)}
                    >
                      {topic.name}<span>→</span>
                    </button>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
