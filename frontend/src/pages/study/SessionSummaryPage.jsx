/**
 * SessionSummaryPage — /app/study-rooms/session/:sessionId/summary
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";

// ── Minimal confetti (reuses the pattern from StudyRoom.jsx) ─────────────────
function Confetti() {
  const particles = useMemo(() =>
    Array.from({ length: 50 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      color: ["#ffd700","#ff6b6b","#4ecdc4","#6366f1","#a78bfa","#34d399","#f59e0b"][i % 7],
      delay: Math.random() * 1.5,
      duration: 2.5 + Math.random() * 2,
      size: 6 + Math.random() * 8,
    })), []);
  return (
    <div className="confetti-container" aria-hidden="true">
      {particles.map((p) => (
        <div key={p.id} className="confetti-particle" style={{
          left: `${p.left}%`,
          backgroundColor: p.color,
          animationDelay: `${p.delay}s`,
          animationDuration: `${p.duration}s`,
          width: p.size,
          height: p.size,
          borderRadius: "2px",
        }} />
      ))}
    </div>
  );
}

function StatCard({ icon, value, label }) {
  return (
    <div className="ls-summary-stat">
      <span className="ls-summary-stat-icon">{icon}</span>
      <span className="ls-summary-stat-val">{value}</span>
      <span className="ls-summary-stat-lbl">{label}</span>
    </div>
  );
}

export default function SessionSummaryPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getSessionSummary(Number(sessionId))
      .then(setSummary)
      .catch((e) => setError(e.message));
  }, [sessionId]);

  if (error) return (
    <div className="ls-page ls-page-centered">
      <div className="ls-error-card">
        <p className="ls-error-text">⚠️ {error}</p>
        <button className="ls-btn-ghost" onClick={() => navigate("/app/study-rooms/start")}>← Back</button>
      </div>
    </div>
  );

  if (!summary) return (
    <div className="ls-page ls-page-centered">
      <div className="ls-loading-spinner" aria-label="Loading" />
    </div>
  );

  const {
    topicName, subject, subjectIcon,
    activitiesCompleted, totalActivities,
    questionsAnswered, questionsCorrect,
    xpEarned, understandingScore,
    feedbackHighlights = [], hintsGiven = [],
  } = summary;

  return (
    <div className="ls-summary-page">
      <Confetti />

      <div className="ls-summary-card">
        {/* Trophy */}
        <div className="ls-summary-trophy">🏆</div>

        <h1 className="ls-summary-title">Learning Session Complete!</h1>
        <p className="ls-summary-topic">
          You've completed <strong>{topicName}</strong>.
        </p>

        {/* Stats */}
        <div className="ls-summary-stats">
          <StatCard
            icon="🎓"
            value={`${activitiesCompleted}/${totalActivities}`}
            label="Activities Completed"
          />
          <StatCard
            icon="❓"
            value={`${questionsAnswered}/${questionsAnswered}`}
            label="Questions Answered"
          />
          <StatCard
            icon="⚡"
            value={`+${xpEarned || 75} XP`}
            label="Earned"
          />
        </div>

        {/* Understanding score */}
        {understandingScore != null && (
          <div className="ls-summary-score">
            <div className="ls-summary-score-header">
              <span>Understanding Score</span>
              <span>{understandingScore}%</span>
            </div>
            <div className="ls-progress-bar-track">
              <div
                className="ls-progress-bar-fill"
                style={{ width: `${understandingScore}%` }}
              />
            </div>
          </div>
        )}

        {/* What you did well */}
        {feedbackHighlights.length > 0 && (
          <div className="ls-summary-section">
            <h3>What you did well</h3>
            <ul className="ls-takeaways">
              {feedbackHighlights.map((f, i) => (
                <li key={i} className="ls-takeaway-item">
                  <span className="ls-takeaway-tick">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Areas to review */}
        {hintsGiven.length > 0 && (
          <div className="ls-summary-section">
            <h3>Areas to review</h3>
            <ul className="ls-takeaways ls-takeaways-review">
              {hintsGiven.map((h, i) => (
                <li key={i} className="ls-takeaway-item">
                  <span className="ls-takeaway-tick ls-tick-warn">💡</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="ls-summary-actions">
          <button
            className="ls-btn-ghost"
            onClick={() => navigate(`/app/study-rooms/session/${sessionId}`)}
          >
            Back to Topic
          </button>
          <button
            className="ls-btn-primary"
            onClick={() => navigate("/app/study-rooms/start")}
          >
            Explore More Topics →
          </button>
        </div>
      </div>
    </div>
  );
}
