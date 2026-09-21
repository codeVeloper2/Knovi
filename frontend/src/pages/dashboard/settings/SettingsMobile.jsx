import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { ChevronRight, ProfileIcon, LearnIcon, SecurityIcon, BellIcon, LogoutIcon } from "../../../components/DashIcons";
import ConfirmDialog from "../../../components/ConfirmDialog";

const SECTIONS = [
  {
    icon: ProfileIcon,
    label: "Profile",
    desc: "Edit name, photo, bio and privacy",
    route: "/app/settings/profile",
    accent: "#5b6ef5",
    emoji: "👤",
  },
  {
    icon: LearnIcon,
    label: "Subjects",
    desc: "Subjects you study and where you want to focus",
    route: "/app/settings/subjects",
    accent: "#0ea5e9",
    emoji: "📚",
  },
  {
    icon: SecurityIcon,
    label: "Security",
    desc: "Password and account settings",
    route: "/app/settings/security",
    accent: "#10b981",
    emoji: "🔒",
  },
  {
    icon: BellIcon,
    label: "Notifications",
    desc: "Choose what to be notified about",
    route: "/app/settings/notifications",
    accent: "#f59e0b",
    emoji: "🔔",
  },
];

export default function SettingsMobile() {
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const name    = profile?.displayName || user?.displayName || "Student";
  const photo   = profile?.photoURL    || user?.photoURL    || "";
  const initial = name.trim()[0]?.toUpperCase() || "S";
  const grade   = profile?.grade   || "";
  const role    = profile?.role    || "student";
  const xp      = profile?.xp      || 0;
  const streak  = profile?.streak  || 0;

  function levelLabel(x) {
    if (x >= 1000) return "Master";
    if (x >= 600)  return "Expert";
    if (x >= 300)  return "Scholar";
    if (x >= 100)  return "Explorer";
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

  return (
    <div className="sm-wrap">

      {/* ── Hero Card ── */}
      <div className="sm-hero">
        <div className="sm-hero-bg" />

        <div className="sm-avatar-ring">
          {photo
            ? <img src={photo} alt={name} referrerPolicy="no-referrer" className="sm-avatar-img" />
            : <span className="sm-avatar-initial">{initial}</span>
          }
        </div>

        <div className="sm-hero-info">
          <h1 className="sm-hero-name">{name}</h1>
          <p className="sm-hero-meta">
            {role.charAt(0).toUpperCase() + role.slice(1)}
            {grade ? ` · ${grade}` : ""}
          </p>
          <span className="sm-hero-level">{levelLabel(xp)}</span>
        </div>

        <div className="sm-hero-stats">
          <div className="sm-stat">
            <span className="sm-stat-val">{xp}</span>
            <span className="sm-stat-lbl">XP</span>
          </div>
          <div className="sm-stat-divider" />
          <div className="sm-stat">
            <span className="sm-stat-val">{streak}</span>
            <span className="sm-stat-lbl">Streak 🔥</span>
          </div>
          <div className="sm-stat-divider" />
          <div className="sm-stat">
            <span className="sm-stat-val">{(profile?.subjectsGoodAt || []).length}</span>
            <span className="sm-stat-lbl">Subjects</span>
          </div>
        </div>

        <button
          type="button"
          className="sm-edit-btn"
          onClick={() => navigate("/app/settings/profile")}
        >
          Edit Profile
        </button>
      </div>

      {/* ── Section List ── */}
      <div className="sm-sections">
        {SECTIONS.map((s) => (
          <button
            key={s.route}
            type="button"
            className="sm-section-row"
            onClick={() => navigate(s.route)}
          >
            <span className="sm-section-icon" style={{ "--accent": s.accent }}>
              {s.emoji}
            </span>
            <div className="sm-section-body">
              <span className="sm-section-label">{s.label}</span>
              <span className="sm-section-desc">{s.desc}</span>
            </div>
            <ChevronRight width={18} height={18} className="sm-section-arrow" />
          </button>
        ))}

        {/* ── Logout Button ── */}
        <button
          type="button"
          className="sm-section-row sm-logout-row"
          onClick={() => setLogoutOpen(true)}
        >
          <span className="sm-section-icon" style={{ "--accent": "#ef4444" }}>
            🚪
          </span>
          <div className="sm-section-body">
            <span className="sm-section-label">Logout</span>
            <span className="sm-section-desc">Sign out of your account</span>
          </div>
          <LogoutIcon width={18} height={18} className="sm-section-arrow" />
        </button>
      </div>

      <p className="sm-footer">PeerUP · Learn. Teach. Grow.</p>

      {/* ── Logout Confirmation Dialog ── */}
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
