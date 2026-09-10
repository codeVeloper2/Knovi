import { useNavigate } from "react-router-dom";

// ── Icons ─────────────────────────────────────────────────────────
const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
);
const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="m22 2-7 20-4-9-9-4 20-7z"/><path d="M22 2 11 13"/>
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
const LocationIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
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

export default function StudentProfilePanel({ student, currentUser, onClose, onSendRequest }) {
  const navigate = useNavigate();

  // Calculate if match is possible
  const myGoodAt = new Set(currentUser?.subjectsGoodAt || []);
  const myNeedHelp = new Set(currentUser?.subjectsNeedHelp || []);
  const theirGoodAt = new Set(student.subjectsGoodAt || []);
  const theirNeedHelp = new Set(student.subjectsNeedHelp || []);

  const canLearnSubjects = [...theirGoodAt].filter(s => myNeedHelp.has(s));
  const canTeachSubjects = [...theirNeedHelp].filter(s => myGoodAt.has(s));
  const canMatch = canLearnSubjects.length > 0 || canTeachSubjects.length > 0;

  // TODO: Check if already matched (query conversations collection)
  const isMatched = false; // Placeholder

  function handleMessage() {
    // Navigate to chat with this user
    navigate("/app/chat");
    onClose();
  }

  function formatJoinDate(dateStr) {
    if (!dateStr) return "Recently";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }

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
            <p className="profile-panel-level">{student.grade || "University Student"}</p>
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

          {/* Action buttons */}
          <div className="profile-panel-actions">
            {isMatched ? (
              student.allowDirectMessage !== false ? (
                <button type="button" className="btn btn-primary btn-full" onClick={handleMessage}>
                  <MessageIcon />
                  Message
                </button>
              ) : (
                <button type="button" className="btn btn-ghost btn-full" disabled title="This student does not accept direct messages">
                  <MessageIcon />
                  Direct messages disabled
                </button>
              )
            ) : canMatch ? (
              <button type="button" className="btn btn-primary btn-full" onClick={onSendRequest}>
                <SendIcon />
                Send Friend Request
              </button>
            ) : (
              <button type="button" className="btn btn-ghost btn-full" disabled>
                No matching subjects
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

          {/* Subjects I Teach */}
          {student.subjectsGoodAt && student.subjectsGoodAt.length > 0 && (
            <div className="profile-panel-section">
              <h3 className="profile-panel-section-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 6 }}>
                  <circle cx="12" cy="12" r="10"/>
                </svg>
                Subjects I Teach
              </h3>
              <div className="profile-panel-tags">
                {student.subjectsGoodAt.map(sub => (
                  <span key={sub} className="profile-tag teaches">{sub}</span>
                ))}
              </div>
            </div>
          )}

          {/* Subjects I Need Help With */}
          {student.subjectsNeedHelp && student.subjectsNeedHelp.length > 0 && (
            <div className="profile-panel-section">
              <h3 className="profile-panel-section-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 6 }}>
                  <circle cx="12" cy="12" r="10"/>
                </svg>
                Subjects I Need Help With
              </h3>
              <div className="profile-panel-tags">
                {student.subjectsNeedHelp.map(sub => (
                  <span key={sub} className="profile-tag needs">{sub}</span>
                ))}
              </div>
            </div>
          )}

          {/* Location */}
          {student.location && (
            <div className="profile-panel-meta">
              <LocationIcon />
              <span>{student.location}</span>
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
