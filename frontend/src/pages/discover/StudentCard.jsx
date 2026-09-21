// ── Icons ─────────────────────────────────────────────────────────
const StarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  </svg>
);
const VerifiedIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
  </svg>
);
const ChatIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

function Avatar({ url, name, size = 48, isOnline = false }) {
  const initials = (name || "?").trim().slice(0, 1).toUpperCase();
  return (
    <div className="discover-avatar-wrap">
      {url ? (
        <img src={url} alt={name} className="discover-avatar" style={{ width: size, height: size }} referrerPolicy="no-referrer" />
      ) : (
        <div className="discover-avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.4 }}>
          {initials}
        </div>
      )}
      {isOnline && <span className="discover-online-badge" />}
    </div>
  );
}

export default function StudentCard({ student, onViewProfile, onMessage }) {
  return (
    <div className="student-card">
      <div className="student-card-header">
        <Avatar url={student.photoURL} name={student.displayName} size={56} isOnline={student.isOnline} />
        <div className="student-card-info">
          <div className="student-card-name-row">
            <span className="student-card-name">{student.displayName}</span>
            {student.emailVerified && (
              <span className="student-verified-badge" title="Verified">
                <VerifiedIcon />
              </span>
            )}
          </div>
          <div className="student-card-meta">
            <span className="student-card-level">{student.grade || "Student"}</span>
            {student.isOnline ? (
              <span className="student-card-status online">Online</span>
            ) : (
              <span className="student-card-status offline">Offline</span>
            )}
          </div>
        </div>
      </div>

      {/* Rating */}
      {student.rating > 0 && (
        <div className="student-card-rating">
          <StarIcon />
          <span className="student-card-rating-value">{student.rating.toFixed(1)}</span>
          <span className="student-card-rating-count">({student.reviewCount} reviews)</span>
        </div>
      )}

      {/* Bio */}
      {student.bio && (
        <p className="student-card-bio">
          {student.bio.length > 120 ? student.bio.slice(0, 120) + "..." : student.bio}
        </p>
      )}

      {/* Actions */}
      <div className="student-card-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={onMessage}>
          <ChatIcon />
          Message
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onViewProfile}>
          View Profile
        </button>
      </div>
    </div>
  );
}
