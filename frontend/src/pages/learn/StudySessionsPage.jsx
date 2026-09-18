import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../../api";

const LABELS = {
  created: "Ready to start",
  teaching: "Learning",
  study: "Studying",
  retrieval: "Practice",
  practice: "Practice",
  reteaching: "Review",
  paused: "Paused",
  completed: "Completed",
  abandoned: "Abandoned",
};

export default function StudySessionsPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAISessions({ limit: 50, offset: 0 })
      .then(data => setSessions(Array.isArray(data) ? data : (data?.items || [])))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  const active = useMemo(
    () => sessions.filter(s => !["completed", "abandoned"].includes(s.status)),
    [sessions]
  );
  const completed = useMemo(
    () => sessions.filter(s => s.status === "completed"),
    [sessions]
  );

  return (
    <div className="learn-secondary-page">
      <div className="learn-secondary-head">
        <div>
          <span className="learn-secondary-kicker">LEARN</span>
          <h1>Study Sessions</h1>
          <p>Pick up an AI learning session where you left off.</p>
        </div>
        <button type="button" className="learn-secondary-primary" onClick={() => navigate("/app/learn")}>
          Start a new session
        </button>
      </div>

      {loading ? (
        <div className="learn-secondary-list">
          {[1, 2, 3].map(i => <div className="learn-session-row skeleton-row" key={i} />)}
        </div>
      ) : sessions.length === 0 ? (
        <div className="learn-empty">
          <span className="learn-empty-icon">🧠</span>
          <h3>No study sessions yet</h3>
          <p>Choose a subject, topic, and concept to start your first AI session.</p>
          <button type="button" className="learn-secondary-primary" onClick={() => navigate("/app/learn")}>
            Explore subjects
          </button>
        </div>
      ) : (
        <div className="learn-secondary-list">
          {active.length > 0 && (
            <section>
              <h2>Continue learning</h2>
              {active.map(session => (
                <button
                  key={session.id}
                  type="button"
                  className="learn-session-row"
                  onClick={() => navigate(`/app/learn/ai/session/${session.id}`)}
                >
                  <span className="learn-session-state active">{LABELS[session.status] || "In progress"}</span>
                  <span className="learn-session-main">
                    <strong>Learning session #{session.id}</strong>
                    <small>{session.studentFamiliarity?.replaceAll("_", " ") || "Personalized AI lesson"}</small>
                  </span>
                  <span className="learn-session-arrow">→</span>
                </button>
              ))}
            </section>
          )}

          <section>
            <h2>Completed</h2>
            {completed.length === 0 ? (
              <div className="learn-secondary-note">Completed sessions will appear here.</div>
            ) : completed.map(session => (
              <div key={session.id} className="learn-session-row completed">
                <span className="learn-session-state done">✓</span>
                <span className="learn-session-main">
                  <strong>Learning session #{session.id}</strong>
                  <small>{session.completedAt ? new Date(session.completedAt).toLocaleDateString() : "Completed"}</small>
                </span>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
