/**
 * TopicConceptsPage — /app/learn/topics/:topicId
 *
 * Shows all concepts for a topic with real lock/progress states from the backend.
 * - First concept: always available
 * - Each subsequent concept: locked until previous is VERIFIED
 * - Clicking current concept navigates to /app/learn/concept/:id
 * - Clicking locked concept shows a locked tooltip
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconLock = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const IconPlay = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <circle cx="12" cy="12" r="10" />
    <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
  </svg>
);

const IconSpinner = () => (
  <svg className="lc-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <circle cx="12" cy="12" r="10" opacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75" />
  </svg>
);

// Stage display labels
const STAGE_LABELS = {
  lesson: "Lesson",
  checkpoint: "Checkpoint",
  explain: "Explain It",
  ai_verification: "AI Verification",
  ask_ai: "Ask AI",
  challenge: "Challenge",
  verified: "Verified",
};

const STAGE_COLORS = {
  lesson:          "#4f6ef7",
  checkpoint:      "#f59e0b",
  explain:         "#8b5cf6",
  ai_verification: "#06b6d4",
  ask_ai:          "#22c55e",
  challenge:       "#f97316",
  verified:        "#22c55e",
};

function ConceptCard({ concept, index, total, onClick }) {
  const { isLocked, displayStatus, currentStage, verified } = concept;

  const statusLabel = (() => {
    if (displayStatus === "verified")     return "✓ Verified";
    if (displayStatus === "in_progress")  return `In Progress · ${STAGE_LABELS[currentStage] || currentStage}`;
    if (displayStatus === "available")    return "Start";
    return "Locked";
  })();

  const cardCls = [
    "lc-concept-card",
    displayStatus === "locked"      ? "lc-locked"      : "",
    displayStatus === "verified"    ? "lc-verified"    : "",
    displayStatus === "in_progress" ? "lc-in-progress" : "",
    displayStatus === "available"   ? "lc-available"   : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={cardCls}
      onClick={() => !isLocked && onClick(concept)}
      role={isLocked ? "presentation" : "button"}
      tabIndex={isLocked ? -1 : 0}
      onKeyDown={e => !isLocked && e.key === "Enter" && onClick(concept)}
      aria-disabled={isLocked}
    >
      {/* Left: index + status icon */}
      <div className="lc-concept-index">
        {displayStatus === "verified" ? (
          <span className="lc-icon-verified"><IconCheck /></span>
        ) : displayStatus === "locked" ? (
          <span className="lc-icon-locked"><IconLock /></span>
        ) : (
          <span className="lc-icon-num">{index + 1}</span>
        )}
      </div>

      {/* Middle: name + status */}
      <div className="lc-concept-body">
        <div className="lc-concept-name">{concept.name}</div>
        {concept.explanation && (
          <div className="lc-concept-desc">{concept.explanation}</div>
        )}
        <div
          className="lc-concept-badge"
          style={displayStatus !== "locked" && currentStage
            ? { color: STAGE_COLORS[currentStage] || "#64748b" }
            : {}}
        >
          {statusLabel}
        </div>
      </div>

      {/* Right: arrow (only when clickable) */}
      {!isLocked && (
        <div className="lc-concept-arrow">
          {displayStatus === "available" || displayStatus === "in_progress" ? (
            <IconPlay />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
          )}
        </div>
      )}
    </div>
  );
}

export default function TopicConceptsPage() {
  const { topicId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/api/v1/concepts/topic/${topicId}/concepts`)
      .then(setData)
      .catch(err => setError(err.message || "Failed to load concepts"))
      .finally(() => setLoading(false));
  }, [topicId]);

  function handleConceptClick(concept) {
    navigate(`/app/learn/concept/${concept.id}`);
  }

  if (loading) {
    return (
      <div className="lc-shell">
        <div className="lc-loading">
          <IconSpinner />
          <span>Loading concepts…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="lc-shell">
        <div className="lc-error">
          <p>{error}</p>
          <button onClick={() => navigate(-1)} className="lc-btn-secondary">Go Back</button>
        </div>
      </div>
    );
  }

  const { topic, subject, concepts, totalConcepts, verifiedConcepts, progressPct } = data;

  return (
    <div className="lc-shell">
      {/* Breadcrumb */}
      <div className="lc-breadcrumb">
        <Link to="/app/learn">Learn</Link>
        <span>›</span>
        <span>{subject?.name}</span>
        <span>›</span>
        <span className="lc-bc-current">{topic.name}</span>
      </div>

      {/* Header */}
      <div className="lc-page-header">
        <div className="lc-page-header-left">
          <div className="lc-page-title">{topic.name}</div>
          {subject?.name && <div className="lc-page-sub">{subject.name}</div>}
          {topic.description && <div className="lc-page-desc">{topic.description}</div>}
        </div>
        <div className="lc-page-header-right">
          <div className="lc-progress-ring">
            <span className="lc-progress-pct">{progressPct}%</span>
            <span className="lc-progress-label">complete</span>
          </div>
        </div>
      </div>

      {/* Progress strip */}
      <div className="lc-progress-strip">
        <div className="lc-progress-bar-track">
          <div className="lc-progress-bar-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="lc-progress-text">
          {verifiedConcepts}/{totalConcepts} concept{totalConcepts !== 1 ? "s" : ""} verified
        </div>
      </div>

      {/* Concepts list */}
      <div className="lc-concepts-list">
        {concepts.length === 0 ? (
          <div className="lc-empty">
            <p>No concepts available for this topic yet.</p>
          </div>
        ) : (
          concepts.map((c, i) => (
            <ConceptCard
              key={c.id}
              concept={c}
              index={i}
              total={totalConcepts}
              onClick={handleConceptClick}
            />
          ))
        )}
      </div>
    </div>
  );
}
