/**
 * SessionSummaryPage — /app/rooms/summary/:sessionId
 * Completed session results for both teacher and learner.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";

// ── Confetti ──────────────────────────────────────────────────────────────────
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
      {particles.map(p => (
        <div key={p.id} className="confetti-particle" style={{
          left: `${p.left}%`, backgroundColor: p.color,
          animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`,
          width: p.size, height: p.size, borderRadius: "2px",
        }} />
      ))}
    </div>
  );
}

function ConceptPill({ result }) {
  const cls = result.needsReview ? "pt-concept-review" : "pt-concept-understood";
  const icon = result.needsReview ? "⚠️" : "✅";
  return (
    <div className={`pt-concept-result ${cls}`}>
      <span>{icon}</span>
      <span className="pt-concept-result-name">{result.conceptName}</span>
      {result.score != null && (
        <span className="pt-concept-result-score">{result.score}/100</span>
      )}
      {result.needsReview && <span className="pt-concept-review-badge">Needs Review</span>}
    </div>
  );
}

export default function SessionSummaryPage() {
  const { sessionId } = useParams();
  const navigate      = useNavigate();
  const [summary, setSummary] = useState(null);
  const [error,   setError]   = useState("");

  useEffect(() => {
    api.getSessionSummary(Number(sessionId))
      .then(setSummary)
      .catch(e => setError(e.message));
  }, [sessionId]);

  if (error) return (
    <div className="pt-page pt-page-centered">
      <div className="pt-error-card"><p className="pt-err-text">⚠️ {error}</p>
        <button className="pt-btn-ghost" onClick={() => navigate("/app/rooms")}>← Back</button>
      </div>
    </div>
  );
  if (!summary) return <div className="pt-page pt-page-centered"><div className="pt-spinner" /></div>;

  const {
    topicName, subject, subjectIcon,
    teacher, learner,
    conceptResults = [],
    practiceTotal, practiceCorrect,
    challengeResult, misconceptionsDetected = [],
    learnerXpEarned, teacherXpEarned,
  } = summary;

  const understood = conceptResults.filter(c => !c.needsReview).length;
  const needsReview = conceptResults.filter(c => c.needsReview).length;
  const practiceAcc = practiceTotal > 0 ? Math.round((practiceCorrect / practiceTotal) * 100) : null;

  return (
    <div className="pt-summary-page">
      <Confetti />

      <div className="pt-summary-card">
        {/* Header */}
        <div className="pt-summary-hero">
          <span className="pt-summary-trophy">🏆</span>
          <h1 className="pt-summary-title">Learning Session Complete!</h1>
          <p className="pt-summary-sub">
            <strong>{subjectIcon} {topicName}</strong> · {subject}
          </p>
        </div>

        {/* Two columns: learner + teacher */}
        <div className="pt-summary-grid">
          {/* Learner column */}
          <div className="pt-summary-col">
            <div className="pt-summary-col-header">
              {learner?.photoUrl
                ? <img src={learner.photoUrl} alt={learner.name} className="pt-summary-avatar" referrerPolicy="no-referrer" />
                : <div className="pt-summary-avatar pt-summary-avatar-fb">{learner?.name?.charAt(0) || "L"}</div>
              }
              <div>
                <p className="pt-summary-role-name">{learner?.name || "Learner"}</p>
                <span className="pt-summary-role-badge learner">Learner</span>
              </div>
            </div>

            <div className="pt-summary-section">
              <h3>Concept Results</h3>
              {conceptResults.length === 0
                ? <p className="pt-summary-empty">No concept results.</p>
                : conceptResults.map(r => <ConceptPill key={r.conceptId} result={r} />)
              }
            </div>

            {practiceTotal > 0 && (
              <div className="pt-summary-stat-row">
                <span>Practice</span>
                <span className={practiceAcc >= 70 ? "pt-stat-good" : "pt-stat-warn"}>
                  {practiceCorrect}/{practiceTotal} correct {practiceAcc != null && `(${practiceAcc}%)`}
                </span>
              </div>
            )}

            {challengeResult && (
              <div className="pt-summary-stat-row">
                <span>Challenge</span>
                <span className={challengeResult.aiVerdict === "correct" ? "pt-stat-good" : "pt-stat-warn"}>
                  {challengeResult.aiVerdict === "correct" ? "✅ Complete" : "⚠️ Needs work"}
                </span>
              </div>
            )}

            <div className="pt-xp-badge learner">
              <span>⚡ XP Earned</span>
              <span className="pt-xp-val">+{learnerXpEarned || 75} XP</span>
            </div>
          </div>

          {/* Teacher column */}
          <div className="pt-summary-col">
            <div className="pt-summary-col-header">
              {teacher?.photoUrl
                ? <img src={teacher.photoUrl} alt={teacher.name} className="pt-summary-avatar" referrerPolicy="no-referrer" />
                : <div className="pt-summary-avatar pt-summary-avatar-fb">{teacher?.name?.charAt(0) || "T"}</div>
              }
              <div>
                <p className="pt-summary-role-name">{teacher?.name || "Teacher"}</p>
                <span className="pt-summary-role-badge teacher">Teacher</span>
              </div>
            </div>

            <div className="pt-summary-section">
              <h3>Teaching Quality</h3>
              {understood > 0 && (
                <p className="pt-teaching-good">
                  ✓ Concepts explained well: {conceptResults.filter(c => !c.needsReview).map(c => c.conceptName).join(", ") || "—"}
                </p>
              )}
              {needsReview > 0 && (
                <p className="pt-teaching-review">
                  ↩ {learner?.name || "Learner"} struggled with: {conceptResults.filter(c => c.needsReview).map(c => c.conceptName).join(", ")} — worth revisiting
                </p>
              )}
            </div>

            <div className="pt-xp-badge teacher">
              <span>⚡ Teaching Bonus</span>
              <span className="pt-xp-val">+{teacherXpEarned || 50} XP</span>
            </div>
          </div>
        </div>

        {/* Misconceptions */}
        {misconceptionsDetected.length > 0 && (
          <div className="pt-summary-misconceptions">
            <h3>⚠️ Misconceptions Detected</h3>
            {misconceptionsDetected.map((m, i) => (
              <div key={i} className="pt-misc-item">
                <span className="pt-misc-name">{m.name || m}</span>
                {m.correction && <span className="pt-misc-correction"> — {m.correction}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="pt-summary-actions">
          <button className="pt-btn-ghost" onClick={() => navigate("/app/chat")}>
            Back to Chat
          </button>
          <button className="pt-btn-primary" onClick={() => navigate("/app/rooms")}>
            Start Another Session →
          </button>
        </div>
      </div>
    </div>
  );
}
