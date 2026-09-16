/**
 * ChallengeReadyStage — shown after successful AI Verification
 *
 * Shows concept info and a "Find a Challenge Partner" CTA.
 * Also lets the user keep using Ask AI or review previous stages.
 */
import { useNavigate } from "react-router-dom";

const IconTrophy = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M6 9H4a2 2 0 0 1-2-2V5h4" />
    <path d="M18 9h2a2 2 0 0 0 2-2V5h-4" />
    <path d="M6 9a6 6 0 0 0 12 0V3H6z" />
    <path d="M12 15v3" />
    <path d="M8 21h8" />
    <path d="M9 18h6" />
  </svg>
);

const IconUsers = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="m5 12 5 5L20 7" />
  </svg>
);

export default function ChallengeReadyStage({ conceptId, concept, progress, onGoToAskAI }) {
  const navigate = useNavigate();

  const prerequisites = [
    { label: "Lesson completed",      done: progress?.lessonCompleted },
    { label: "Checkpoint passed",     done: progress?.checkpointPassed },
    { label: "Explanation submitted", done: progress?.explanationPassed },
    { label: "AI verification passed",done: progress?.aiVerificationPassed },
  ];

  return (
    <div className="cr-stage">
      {/* Trophy header */}
      <div className="cr-header">
        <div className="cr-trophy-icon">
          <IconTrophy />
        </div>
        <h2 className="cr-title">Concept Ready</h2>
        <p className="cr-subtitle">
          You've demonstrated your understanding through the solo learning pipeline.
          Now prove it with another learner at the same stage.
        </p>
      </div>

      {/* Concept info */}
      {concept && (
        <div className="cr-concept-card">
          <div className="cr-concept-label">Ready to Challenge</div>
          <div className="cr-concept-name">{concept.name}</div>
          {concept.explanation && (
            <div className="cr-concept-explanation">{concept.explanation}</div>
          )}
        </div>
      )}

      {/* Prerequisites checklist */}
      <div className="cr-prerequisites">
        <div className="cr-prereq-title">Your completed stages</div>
        {prerequisites.map((p, i) => (
          <div key={i} className={`cr-prereq-item ${p.done ? "cr-prereq-done" : ""}`}>
            <span className={`cr-prereq-icon ${p.done ? "cr-prereq-icon-done" : ""}`}>
              {p.done ? <IconCheck /> : <span>○</span>}
            </span>
            <span>{p.label}</span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="cr-actions">
        <button
          className="cr-btn-primary"
          onClick={() => navigate(`/app/challenge/find/${conceptId}`)}
        >
          <IconUsers />
          Find a Challenge Partner
        </button>

        <button
          className="cr-btn-secondary"
          onClick={() => onGoToAskAI && onGoToAskAI()}
        >
          Continue with Ask AI
        </button>
      </div>

      {/* Info note */}
      <div className="cr-info-note">
        <p>
          You'll be matched with a student at the same concept and stage.
          The Challenge verifies your understanding through peer interaction and AI evaluation.
          Only a successful Challenge marks this concept as <strong>Verified</strong>.
        </p>
      </div>
    </div>
  );
}
