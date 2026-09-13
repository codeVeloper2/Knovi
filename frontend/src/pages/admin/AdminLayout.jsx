import { useState, useEffect } from "react";
import { Link, NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const NAV = [
  { label: "Dashboard", icon: "⬡", to: "/admin", exact: true },
  {
    label: "Curriculum", icon: "📚",
    children: [
      { label: "Subjects",       icon: "📖", to: "/admin/curriculum/subjects" },
      { label: "Topics",         icon: "📝", to: "/admin/curriculum/topics" },
      { label: "Concepts",       icon: "💡", to: "/admin/curriculum/concepts" },
      { label: "Objectives",     icon: "🎯", to: "/admin/curriculum/objectives" },
      { label: "Misconceptions", icon: "⚠️", to: "/admin/curriculum/misconceptions" },
      { label: "Activities",     icon: "⚡", to: "/admin/curriculum/activities" },
      { label: "Questions",      icon: "❓", to: "/admin/curriculum/questions" },
      { label: "Resources",      icon: "🔗", to: "/admin/curriculum/resources" },
    ],
  },
  { label: "Users",  icon: "👤", to: "/admin/users" },
  { label: "System", icon: "⚙️", to: "/admin/system" },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [currOpen,    setCurrOpen]    = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer

  // Close mobile sidebar on route change
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  const initials = (user?.displayName || "A").charAt(0).toUpperCase();

  return (
    <div className="adm2-shell">

      {/* ── MOBILE OVERLAY ───────────────────────────────────── */}
      {sidebarOpen && (
        <div className="adm2-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── SIDEBAR ─────────────────────────────────────────── */}
      <aside className={`adm2-sidebar ${sidebarOpen ? "open" : ""}`}>

        {/* Logo */}
        <Link to="/admin" className="adm2-logo">
          <span className="adm2-logo-mark">P</span>
          <span className="adm2-logo-text">PeerUP</span>
          <span className="adm2-logo-badge">Admin</span>
        </Link>

        {/* Nav */}
        <nav className="adm2-nav">
          {NAV.map((item) => {
            if (item.children) {
              return (
                <div key={item.label}>
                  <button
                    className="adm2-nav-group"
                    onClick={() => setCurrOpen(o => !o)}
                  >
                    <span className="adm2-nav-icon">{item.icon}</span>
                    <span className="adm2-nav-label">{item.label}</span>
                    <span className={`adm2-nav-arrow ${currOpen ? "open" : ""}`}>▾</span>
                  </button>
                  {currOpen && (
                    <div className="adm2-nav-children">
                      {item.children.map(child => (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          className={({ isActive }) =>
                            `adm2-nav-child ${isActive ? "active" : ""}`
                          }
                        >
                          <span className="adm2-child-icon">{child.icon}</span>
                          {child.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                className={({ isActive }) =>
                  `adm2-nav-link ${isActive ? "active" : ""}`
                }
              >
                <span className="adm2-nav-icon">{item.icon}</span>
                <span className="adm2-nav-label">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="adm2-sidebar-footer">
          <Link to="/app" className="adm2-footer-link">
            <span>←</span> Student App
          </Link>
          <button className="adm2-footer-logout" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── MAIN ────────────────────────────────────────────── */}
      <div className="adm2-main">

        {/* Top bar */}
        <header className="adm2-topbar">
          {/* Hamburger (mobile only) */}
          <button
            className="adm2-hamburger"
            onClick={() => setSidebarOpen(o => !o)}
            aria-label="Open menu"
          >
            <span/><span/><span/>
          </button>

          {/* Breadcrumb / page title */}
          <div className="adm2-topbar-title">
            {location.pathname === "/admin"
              ? "Dashboard"
              : location.pathname.split("/").filter(Boolean).slice(1).map(s =>
                  s.charAt(0).toUpperCase() + s.slice(1)
                ).join(" › ")}
          </div>

          {/* Right side */}
          <div className="adm2-topbar-right">
            <button className="adm2-notif-btn" aria-label="Notifications">
              🔔
            </button>
            <div className="adm2-user-chip">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="" className="adm2-avatar"/>
              ) : (
                <div className="adm2-avatar-fallback">{initials}</div>
              )}
              <div className="adm2-user-info">
                <span className="adm2-user-name">{user?.displayName || "Admin"}</span>
                <span className="adm2-user-role">Administrator</span>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="adm2-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
