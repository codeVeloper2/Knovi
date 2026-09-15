/**
 * SoloTopicsPage — /app/solo/subjects/:subjectId
 * Shows topics for a subject.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";
import "./solo.css";

export default function SoloTopicsPage() {
  const { subjectId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getSubject(subjectId),
      api.soloGetTopics(subjectId),
    ]).then(([subject, topics]) => {
      setData({ subject, topics });
    }).catch(() => {}).finally(() => setLoading(false));
  }, [subjectId]);

  if (loading) return (
    <div className="solo-shell">
      <div className="solo-loading"><div className="solo-spinner" />Loading topics…</div>
    </div>
  );

  if (!data) return (
    <div className="solo-shell">
      <div className="solo-empty"><div className="solo-empty-icon">⚠️</div><p>Subject not found.</p></div>
    </div>
  );

  const { subject, topics } = data;

  return (
    <div className="solo-shell">
      <div className="solo-breadcrumb">
        <Link to="/app/solo">Learn</Link>
        <span className="bc-sep">›</span>
        <span className="bc-current">{subject.name}</span>
      </div>
      <div className="solo-page-header">
        <div>
          <div className="solo-page-title">{subject.name}</div>
          <div className="solo-page-sub">{topics.length} topic{topics.length !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {topics.length === 0 ? (
        <div className="solo-empty">
          <div className="solo-empty-icon">📖</div>
          <p>No topics available yet.</p>
        </div>
      ) : (
        <div className="solo-grid">
          {topics.map(t => (
            <div
              key={t.id}
              className="subject-card"
              onClick={() => navigate(`/app/solo/topics/${t.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === "Enter" && navigate(`/app/solo/topics/${t.id}`)}
            >
              <div className="subject-card-name">{t.name}</div>
              {t.description && (
                <div className="subject-card-desc">{t.description}</div>
              )}
              <div className="subject-card-progress">
                <div className="solo-progress-bar-wrap" style={{ flex: 1 }}>
                  <div
                    className="solo-progress-bar-fill"
                    style={{ width: `${t.progressPct || 0}%` }}
                  />
                </div>
                <span className="subject-progress-text">
                  {t.passedConcepts || 0}/{t.totalConcepts || 0}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
