/**
 * SoloHomePage — /app/solo
 * Shows subjects list. Entry point into the Solo Learning workflow.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../../api";
import "./solo.css";

const SUBJECT_ICONS = {
  physics: "⚛️", mathematics: "📐", math: "📐", chemistry: "🧪",
  biology: "🧬", history: "📜", english: "📝", geography: "🌍",
  computer: "💻", science: "🔬", economics: "📊",
};

function subjectIcon(name) {
  const key = (name || "").toLowerCase();
  for (const [k, v] of Object.entries(SUBJECT_ICONS)) {
    if (key.includes(k)) return v;
  }
  return "📚";
}

export default function SoloHomePage() {
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.soloGetSubjects()
      .then(setSubjects)
      .catch(() => setError("Could not load subjects."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="solo-shell">
      <div className="solo-loading"><div className="solo-spinner" /> Loading subjects…</div>
    </div>
  );

  if (error) return (
    <div className="solo-shell">
      <div className="solo-empty"><div className="solo-empty-icon">⚠️</div><p>{error}</p></div>
    </div>
  );

  return (
    <div className="solo-shell">
      <div className="solo-page-header">
        <div>
          <div className="solo-page-title">Learn</div>
          <div className="solo-page-sub">Choose a subject to start learning</div>
        </div>
      </div>

      {subjects.length === 0 ? (
        <div className="solo-empty">
          <div className="solo-empty-icon">📚</div>
          <p>No subjects available yet. Check back soon.</p>
        </div>
      ) : (
        <div className="solo-grid">
          {subjects.map(s => (
            <div
              key={s.id}
              className="subject-card"
              onClick={() => navigate(`/app/solo/subjects/${s.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === "Enter" && navigate(`/app/solo/subjects/${s.id}`)}
            >
              <div className="subject-card-icon">{subjectIcon(s.name)}</div>
              <div className="subject-card-name">{s.name}</div>
              {s.description && (
                <div className="subject-card-desc">{s.description}</div>
              )}
              <div className="subject-card-progress">
                <div className="solo-progress-bar-wrap" style={{ flex: 1 }}>
                  <div
                    className="solo-progress-bar-fill"
                    style={{ width: `${s.progressPct || 0}%` }}
                  />
                </div>
                <span className="subject-progress-text">
                  {s.passedConcepts || 0}/{s.totalConcepts || 0} concepts
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
