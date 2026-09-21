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

export default function StudentProfilePanel({ student, onClose, onMessage }) {
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

          {/* Action button */}
          <div className="profile-panel-actions">
            {student.allowDirectMessage !== false ? (
              <button type="button" className="btn btn-primary btn-full" onClick={onMessage}>
                <MessageIcon />
                Message
              </button>
            ) : (
              <button type="button" className="btn btn-ghost btn-full" disabled title="This student does not accept direct messages">
                <MessageIcon />
                Direct messages disabled
              </button>
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
