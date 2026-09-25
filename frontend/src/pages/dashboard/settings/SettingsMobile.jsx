import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import {
  ChevronRight,
  ProfileIcon,
  LearnIcon,
  SecurityIcon,
  BellIcon,
  LogoutIcon,
} from "../../../components/DashIcons";
import ConfirmDialog from "../../../components/ConfirmDialog";

const SECTIONS = [
  {
    icon: ProfileIcon,
    label: "Profile",
    desc: "Your name, photo, bio and privacy",
    route: "/app/settings/profile",
    tone: "blue",
  },
  {
    icon: LearnIcon,
    label: "Learning Profile",
    desc: "Personalize your AI learning experience",
    route: "/app/settings/learning-profile",
    tone: "purple",
  },
  {
    icon: SecurityIcon,
    label: "Security",
    desc: "Password and account protection",
    route: "/app/settings/security",
    tone: "green",
  },
  {
    icon: BellIcon,
    label: "Notifications",
    desc: "Choose which updates you receive",
    route: "/app/settings/notifications",
    tone: "amber",
  },
];

function SettingsSkeleton() {
  return (
    <div className="settings-hub settings-hub--skeleton" aria-label="Loading settings">
      <div className="settings-skeleton-hero">
        <span className="settings-skeleton settings-skeleton-avatar" />
        <div className="settings-skeleton-copy">
          <span className="settings-skeleton settings-skeleton-title" />
          <span className="settings-skeleton settings-skeleton-line" />
          <span className="settings-skeleton settings-skeleton-pill" />
        </div>
      </div>

      <div className="settings-skeleton-list">
        {SECTIONS.map((section) => (
          <div className="settings-skeleton-row" key={section.route}>
            <span className="settings-skeleton settings-skeleton-icon" />
            <span className="settings-skeleton settings-skeleton-row-title" />
            <span className="settings-skeleton settings-skeleton-arrow" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SettingsMobile() {
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAvatar, setShowAvatar] = useState(false);

  // Keep the hub visually stable while auth/profile data settles.
  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 450);
    return () => window.clearTimeout(timer);
  }, []);

  const name = profile?.displayName || user?.displayName || "Student";
  const email = profile?.email || user?.email || "";
  const photo = profile?.photoURL || user?.photoURL || "";
  const initial = name.trim().slice(0, 1).toUpperCase() || "S";
  const grade = profile?.grade || "";
  const xp = Number(profile?.xp || 0);
  const streak = Number(profile?.streak || 0);

  function levelLabel(value) {
    if (value >= 1000) return "Master";
    if (value >= 600) return "Expert";
    if (value >= 300) return "Scholar";
    if (value >= 100) return "Explorer";
    return "Beginner";
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      navigate("/login");
    } finally {
      setLoggingOut(false);
      setLogoutOpen(false);
    }
  }

  if (loading) return <SettingsSkeleton />;

  return (
    <div className="settings-hub">
      <header className="settings-hub-header">
        <div>
          <p className="settings-eyebrow">ACCOUNT</p>
          <h1>Settings</h1>
          <p className="settings-hub-subtitle">
            Manage your profile, learning preferences, security and notifications.
          </p>
        </div>
      </header>

      <section className="settings-account-card">
        <div className="settings-account-main">
          <button
            type="button"
            className="settings-account-avatar"
            onClick={() => setShowAvatar(true)}
            aria-label={`View ${name}'s full profile picture`}
          >
            {photo ? (
              <img src={photo} alt={name} referrerPolicy="no-referrer" />
            ) : (
              <span>{initial}</span>
            )}
            <span className="settings-avatar-view-hint" aria-hidden="true">⌕</span>
          </button>

          <div className="settings-account-copy">
            <div className="settings-account-name-row">
              <h2>{name}</h2>
              <span className="settings-level">{levelLabel(xp)}</span>
            </div>
            <p className="settings-account-email">{email || "Knovi student"}</p>
            <p className="settings-account-meta">
              {grade || "Student"} <span aria-hidden="true">·</span> Member account
            </p>
          </div>

          <button
            type="button"
            className="settings-edit-profile"
            onClick={() => navigate("/app/settings/profile")}
          >
            Edit profile
          </button>
        </div>

        <div className="settings-account-stats">
          <div>
            <strong>{xp}</strong>
            <span>XP earned</span>
          </div>
          <div>
            <strong>{streak}</strong>
            <span>Day streak</span>
          </div>
          <div>
            <strong>{SECTIONS.length}</strong>
            <span>Account areas</span>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-heading">
          <div>
            <h2>Account settings</h2>
            <p>Choose an area to update your Knovi experience.</p>
          </div>
        </div>

        <div className="settings-options">
          {SECTIONS.map(({ icon: Icon, label, desc, route, tone }) => (
            <button
              key={route}
              type="button"
              className="settings-option"
              onClick={() => navigate(route)}
            >
              <span className={`settings-option-icon settings-option-icon--${tone}`}>
                <Icon width={20} height={20} />
              </span>
              <span className="settings-option-copy">
                <strong>{label}</strong>
                <span>{desc}</span>
              </span>
              <ChevronRight width={19} height={19} className="settings-option-arrow" />
            </button>
          ))}
        </div>
      </section>

      <section className="settings-support-card">
        <div className="settings-support-icon">✓</div>
        <div>
          <strong>Your account is protected</strong>
          <p>Keep your password private and review your security settings regularly.</p>
        </div>
      </section>

      <button
        type="button"
        className="settings-logout"
        onClick={() => setLogoutOpen(true)}
      >
        <LogoutIcon width={19} height={19} />
        <span>Log out</span>
      </button>

      <p className="settings-hub-footer">Knovi · Learn. Teach. Grow.</p>

      {showAvatar && (
        <div
          className="settings-avatar-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Full profile picture"
          onClick={() => setShowAvatar(false)}
        >
          <button
            type="button"
            className="settings-avatar-lightbox-close"
            onClick={() => setShowAvatar(false)}
            aria-label="Close profile picture"
          >
            ×
          </button>
          <div className="settings-avatar-lightbox-content" onClick={(e) => e.stopPropagation()}>
            {photo ? (
              <img src={photo} alt={name} referrerPolicy="no-referrer" />
            ) : (
              <span>{initial}</span>
            )}
            <p>{name}</p>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={logoutOpen}
        onCancel={() => !loggingOut && setLogoutOpen(false)}
        onConfirm={handleLogout}
        title="Logout"
        message="Are you sure you want to logout?"
        confirmText="Logout"
        loading={loggingOut}
        danger
      />
    </div>
  );
}
