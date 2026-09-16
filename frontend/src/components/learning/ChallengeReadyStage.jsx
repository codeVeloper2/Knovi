/**
 * ChallengeReadyStage — shown when student has passed all solo learning stages.
 * Explains what the Challenge is and sends the student to find a peer partner.
 */
import { useNavigate } from "react-router-dom";

function IconTrophy() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4a2 2 0 0 1-2-2V5h4" /><path d="M18 9h2a2 2 0 0 0 2-2V5h-4" />
      <path d="M6 9a6 6 0 0 0 12 0V3H6z" /><path d="M12 15v3" /><path d="M8 21h8" /><path d="M9 18h6" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}
function IconChat() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

const PREREQS = [
  { key: "lessonCompleted",       label: "Lesson completed" },
  { key: "checkpointPassed",      label: "Checkpoint passed" },
  { key: "explanationPassed",     label: "Explanation submitted" },
  { key: "aiVerificationPassed",  label: "AI verification passed" },
];

export default function ChallengeReadyStage({ conceptId, concept, progress, onGoToAskAI }) {
  const navigate = useNavigate();

  return (
    <div className="cr-stage">
      {/* Trophy header */}
      <div className="cr-header">
        <div className="cr-trophy"><IconTrophy /></div>
        <h2 className="cr-title">You're Ready to Prove It</h2>
        <p className="cr-subtitle">
          You've completed the solo learning pipeline.
          Now verify your understanding by challenging another student at the same stage.
        </p>
      </div>

      {/* Concept card */}
      {concept && (
        <div className="cr-concept-card">
          <div className="cr-concept-tag">Concept to verify</div>
          <div className="cr-concept-name">{concept.name}</div>
          {concept.explanation && (
            <p className="cr-concept-explain">{concept.explanation}</p>
          )}
        </div>
      )}

      {/* Prereqs checklist */}
      <div className="cr-prereqs">
        <div className="cr-prereqs-title">Completed stages</div>
        {PREREQS.map(p => {
          const done = !!progress?.[p.key];
          return (
            <div key={p.key} className={`cr-prereq ${done ? "cr-prereq-done" : "cr-prereq-pending"}`}>
              <span className={`cr-prereq-icon ${done ? "cr-pi-done" : ""}`}>
                {done ? <IconCheck /> : <span>○</span>}
              </span>
              <span>{p.label}</span>
            </div>
          );
        })}
      </div>

      {/* What is a Challenge */}
      <div className="cr-info-box">
        <p>
          You'll be matched with a student who is at exactly the same concept and stage.
          You'll answer questions, discuss the concept, and the AI will evaluate both of you.
          A successful Challenge marks this concept as <strong>Verified</strong> and unlocks the next one.
        </p>
      </div>

      {/* Actions */}
      <div className="cr-actions">
        <button
          className="cr-btn-primary"
          onClick={() => navigate(`/app/challenge/find/${conceptId}`)}
        >
          <IconUsers /> Find a Challenge Partner
        </button>
        <button
          className="cr-btn-secondary"
          onClick={() => onGoToAskAI?.()}
        >
          <IconChat /> Ask AI More Questions
        </button>
      </div>
    </div>
  );
}
