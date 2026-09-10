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
const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="m22 2-7 20-4-9-9-4 20-7z"/><path d="M22 2 11 13"/>
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

export default function StudentCard({ student, currentUser, onViewProfile, onSendRequest }) {
  // Calculate subject intersection to determine if match is possible
  const myGoodAt = new Set(currentUser?.subjectsGoodAt || []);
  const myNeedHelp = new Set(currentUser?.subjectsNeedHelp || []);
  const theirGoodAt = new Set(student.subjectsGoodAt || []);
  const theirNeedHelp = new Set(student.subjectsNeedHelp || []);

  // What can they teach me? (their good_at ∩ my need_help)
  const theyCanTeachMe = [...theirGoodAt].filter(s => myNeedHelp.has(s));
  // What can I teach them? (my good_at ∩ their need_help)
  const iCanTeachThem = [...myGoodAt].filter(s => theirNeedHelp.has(s));

  const canMatch = theyCanTeachMe.length > 0 || iCanTeachThem.length > 0;

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
            <span className="student-card-level">{student.grade || "University Student"}</span>
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

      {/* Can help you with */}
      {theyCanTeachMe.length > 0 && (
        <div className="student-card-tags">
          <div className="student-card-tags-label teaches">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="10"/>
            </svg>
            Can help you with
          </div>
          <div className="student-card-tags-list">
            {theyCanTeachMe.slice(0, 3).map(sub => (
              <span key={sub} className="student-tag teaches">{sub}</span>
            ))}
            {theyCanTeachMe.length > 3 && (
              <span className="student-tag teaches">+{theyCanTeachMe.length - 3}</span>
            )}
          </div>
        </div>
      )}

      {/* You can help them with */}
      {iCanTeachThem.length > 0 && (
        <div className="student-card-tags">
          <div className="student-card-tags-label needs">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="10"/>
            </svg>
            You can help them with
          </div>
          <div className="student-card-tags-list">
            {iCanTeachThem.slice(0, 3).map(sub => (
              <span key={sub} className="student-tag needs">{sub}</span>
            ))}
            {iCanTeachThem.length > 3 && (
              <span className="student-tag needs">+{iCanTeachThem.length - 3}</span>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="student-card-actions">
        {canMatch ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={onSendRequest}>
            <SendIcon />
            Send Match Request
          </button>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" disabled title="No matching subjects">
            No matching subjects
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onViewProfile}>
          View Profile
        </button>
      </div>
    </div>
  );
}
