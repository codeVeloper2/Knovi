import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { 
  ProfileIcon, 
  LearnIcon, 
  SecurityIcon, 
  BellIcon,
  ChevronRight 
} from "../../../components/DashIcons";

/**
 * SettingsMobile — Unified settings page for mobile
 * Shows user profile at top with all settings sections as navigable cards
 */
export default function SettingsMobile() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const name = profile?.displayName || user?.displayName || "User";
  const photo = profile?.photoURL || user?.photoURL || "";
  const initial = name.trim().slice(0, 1).toUpperCase();
  const grade = profile?.grade || "";
  const role = profile?.role || "Student";

  const settingsSections = [
    {
      icon: ProfileIcon,
      label: "Profile",
      route: "/app/settings/profile",
      description: "Edit your profile information"
    },
    {
      icon: LearnIcon,
      label: "Subjects",
      route: "/app/settings/subjects",
      description: "Manage your learning subjects"
    },
    {
      icon: SecurityIcon,
      label: "Account & Security",
      route: "/app/settings/security",
      description: "Password and security settings"
    },
    {
      icon: BellIcon,
      label: "Notifications",
      route: "/app/settings/notifications",
      description: "Notification preferences"
    }
  ];

  return (
    <div className="settings-mobile">
      {/* User Profile Card */}
      <div className="settings-mobile-profile">
        <div className="settings-mobile-avatar">
          {photo ? (
            <img src={photo} alt={name} referrerPolicy="no-referrer" />
          ) : (
            <span className="settings-mobile-avatar-text">{initial}</span>
          )}
        </div>
        <div className="settings-mobile-info">
          <h2 className="settings-mobile-name">{name}</h2>
          <p className="settings-mobile-meta">
            {role}{grade ? ` • Grade ${grade}` : ""}
          </p>
        </div>
        <button
          type="button"
          className="settings-mobile-edit-btn"
          onClick={() => navigate("/app/settings/profile")}
        >
          Edit Profile
        </button>
      </div>

      {/* Settings Sections */}
      <div className="settings-mobile-sections">
        {settingsSections.map((section) => (
          <button
            key={section.route}
            type="button"
            className="settings-mobile-section-card"
            onClick={() => navigate(section.route)}
          >
            <div className="settings-mobile-section-icon">
              <section.icon width={20} height={20} />
            </div>
            <div className="settings-mobile-section-content">
              <span className="settings-mobile-section-label">{section.label}</span>
              {section.description && (
                <span className="settings-mobile-section-desc">{section.description}</span>
              )}
            </div>
            <ChevronRight width={18} height={18} className="settings-mobile-section-arrow" />
          </button>
        ))}
      </div>
    </div>
  );
}
