// ── Icons ─────────────────────────────────────────────────────────
const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
);
const MessageIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);
const SwordIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/>
    <line x1="13" y1="19" x2="19" y2="13"/>
    <line x1="16" y1="16" x2="19" y2="19"/>
    <line x1="20" y1="21" x2="21" y2="20"/>
  </svg>
);
const StarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  </svg>
);
const VerifiedIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
  </svg>
);
const CalendarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
  </svg>
);
const SparkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
  </svg>
);

function Avatar({ url, name, size = 80, isOnline = false }) {
  const initials = (name || "?").trim().slice(0, 1).toUpperCase();
  return (
    <div className="profile-panel-avatar-wrap">
      {url ? (
        <img src={url} alt={name} className="profile-panel-avatar" style={{ width: size, height: size }} referrerPolicy="no-referrer" />
      ) : (
        <div className="profile-panel-avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.4 }}>
          {initials}
        </div>
      )}
      {isOnline && <span className="profile-panel-online-badge" />}
    </div>
  );
}

function formatJoinDate(dateStr) {
  if (!dateStr) return "Recently";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/**
 * Learning overlap section shown inside the profile panel.
 * Displays the curriculum breadcrumb and the natural-language reason.
 */
function LearningOverlapSection({ overlap }) {
  if (!overlap) return null;
  const { type, subjectName, topicName, conceptName, reason, isActive } = overlap;

  return (
    <div className="profile-panel-section">
      <h3 className="profile-panel-section-title">
        <SparkIcon /> Learning overlap
      </h3>
      {isActive && (
        <span className="disc-overlap-active-dot" style={{ marginBottom: 6, display: "inline-block" }}>
          🟢 Learning now
        </span>
      )}
      <div className="disc-overlap-breadcrumb">
        <span className="disc-overlap-crumb disc-overlap-crumb--subject">{subjectName}</span>
        {(type === "topic" || type === "concept") && topicName && (
          <>
            <span className="disc-overlap-arrow">→</span>
            <span className="disc-overlap-crumb disc-overlap-crumb--topic">{topicName}</span>
          </>
        )}
        {type === "concept" && conceptName && (
          <>
            <span className="disc-overlap-arrow">→</span>
            <span className="disc-overlap-crumb disc-overlap-crumb--concept">{conceptName}</span>
          </>
        )}
      </div>
      <p className="disc-overlap-reason" style={{ marginTop: 6 }}>"{reason}"</p>
    </div>
  );
}

/**
 * StudentProfilePanel
 *
 * Props:
 *  student        — User serialisation + relationship/learningOverlap/challengeEligible
 *  currentUser    — The authenticated user's profile
 *  onClose        — Close the panel
 *  onMessage      — Start/open a chat conversation
 *  onChallenge    — Start a Challenge (null when not eligible)
 */
export default function StudentProfilePanel({ student, onClose, onMessage, onChallenge }) {
  const relationship = student.relationship ?? "none";
  const learningOverlap = student.learningOverlap ?? null;
  const challengeEligible = student.challengeEligible ?? false;
  const canMessage = student.allowDirectMessage !== false;

  return (
    <>
      <div className="profile-panel-overlay" onClick={onClose} />
      <div className="profile-panel">
        {/* Header */}
        <div className="profile-panel-header">
          <button type="button" className="profile-panel-back" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <button type="button" className="profile-panel-close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        {/* Profile content */}
        <div className="profile-panel-content">
          {/* Avatar and name */}
          <div className="profile-panel-top">
            <Avatar url={student.photoURL} name={student.displayName} size={100} isOnline={student.isOnline} />
            <div className="profile-panel-name-row">
              <h2 className="profile-panel-name">{student.displayName}</h2>
              {student.emailVerified && (
                <span className="profile-panel-verified" title="Verified">
                  <VerifiedIcon />
                </span>
              )}
            </div>
            <p className="profile-panel-level">{student.grade || "Student"}</p>
          </div>

          {/* Stats */}
          <div className="profile-panel-stats">
            <div className="profile-panel-stat">
              <div className="profile-panel-stat-value">{student.reviewCount || 0}</div>
              <div className="profile-panel-stat-label">Reviews</div>
            </div>
            <div className="profile-panel-stat">
              <div className="profile-panel-stat-value">
                <StarIcon />
                {student.rating ? student.rating.toFixed(1) : "0.0"}
              </div>
              <div className="profile-panel-stat-label">Rating</div>
            </div>
            <div className="profile-panel-stat">
              <div className="profile-panel-stat-value">{student.sessionCount || 0}</div>
              <div className="profile-panel-stat-label">Sessions</div>
            </div>
          </div>

          {/* Learning overlap — shown when present */}
          <LearningOverlapSection overlap={learningOverlap} />

          {/* Action buttons */}
          <div className="profile-panel-actions">
            {relationship === "conversation" ? (
              <>
                {canMessage ? (
                  <button type="button" className="btn btn-primary btn-full" onClick={onMessage}>
                    <MessageIcon /> Message
                  </button>
                ) : (
                  <button type="button" className="btn btn-ghost btn-full" disabled title="This student does not accept direct messages">
                    <MessageIcon /> Direct messages disabled
                  </button>
                )}
                {challengeEligible && onChallenge && (
                  <button
                    type="button"
                    className="btn btn-challenge btn-full"
                    onClick={onChallenge}
                    style={{ marginTop: 8 }}
                  >
                    <SwordIcon /> Challenge to AI Quiz Battle
                  </button>
                )}
              </>
            ) : (
              // Not yet connected
              canMessage ? (
                <button type="button" className="btn btn-primary btn-full" onClick={onMessage}>
                  Connect & Message
                </button>
              ) : (
                <button type="button" className="btn btn-ghost btn-full" disabled title="This student does not accept direct messages">
                  <MessageIcon /> Direct messages disabled
                </button>
              )
            )}
          </div>

          {/* About Me */}
          {student.bio && (
            <div className="profile-panel-section">
              <h3 className="profile-panel-section-title">About Me</h3>
              <p className="profile-panel-bio">{student.bio}</p>
            </div>
          )}

          {/* Joined date */}
          <div className="profile-panel-meta">
            <CalendarIcon />
            <span>Joined {formatJoinDate(student.createdAt)}</span>
          </div>
        </div>
      </div>
    </>
  );
}
