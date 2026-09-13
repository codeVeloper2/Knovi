/**
 * AdminLayout — shared shell for all /admin/* pages.
 *
 * Renders:
 *   - Left sidebar: logo, nav links (Dashboard, Curriculum sub-tree, Users, System)
 *   - Top bar: search, notifications, admin avatar + name
 *   - Main content: <Outlet /> from React Router
 *
 * Protected by AdminRoute in App.jsx — this component itself does not
 * re-check the role; it trusts the route guard.
 */
import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

// ── Nav structure ────────────────────────────────────────────────────────────
const NAV = [
  {
    label: "Dashboard",
    icon: "⬡",
    to: "/admin",
    exact: true,
  },
  {
    label: "Curriculum",
    icon: "📚",
    children: [
      { label: "Subjects",       to: "/admin/curriculum/subjects" },
      { label: "Topics",         to: "/admin/curriculum/topics" },
      { label: "Concepts",       to: "/admin/curriculum/concepts" },
      { label: "Objectives",     to: "/admin/curriculum/objectives" },
      { label: "Misconceptions", to: "/admin/curriculum/misconceptions" },
      { label: "Activities",     to: "/admin/curriculum/activities" },
      { label: "Questions",      to: "/admin/curriculum/questions" },
      { label: "Resources",      to: "/admin/curriculum/resources" },
    ],
  },
  { label: "Users",  icon: "👤", to: "/admin/users" },
  { label: "System", icon: "⚙️",  to: "/admin/system" },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [currOpen, setCurrOpen] = useState(true); // curriculum sub-tree open by default

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="adm-shell">
      {/* ── SIDEBAR ── */}
      <aside className="adm-sidebar">
        <Link to="/admin" className="adm-logo">
          <span className="adm-logo-mark">P</span>
          <span className="adm-logo-text">PeerUP</span>
        </Link>

        <nav className="adm-nav">
          {NAV.map((item) => {
            if (item.children) {
              return (
                <div key={item.label}>
                  <button
                    className="adm-nav-group-btn"
                    onClick={() => setCurrOpen((o) => !o)}
                    aria-expanded={currOpen}
                  >
                    <span className="adm-nav-icon">{item.icon}</span>
                    <span className="adm-nav-label">{item.label}</span>
                    <span className={`adm-nav-arrow ${currOpen ? "open" : ""}`}>▾</span>
                  </button>
                  {currOpen && (
                    <div className="adm-nav-children">
                      {item.children.map((child) => (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          className={({ isActive }) =>
                            `adm-nav-child ${isActive ? "active" : ""}`
                          }
                        >
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
                  `adm-nav-link ${isActive ? "active" : ""}`
                }
              >
                <span className="adm-nav-icon">{item.icon}</span>
                <span className="adm-nav-label">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="adm-sidebar-footer">
          <Link to="/app" className="adm-back-link">← Student App</Link>
          <button className="adm-logout-btn" onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      {/* ── MAIN AREA ── */}
      <div className="adm-body">
        {/* Top bar */}
        <header className="adm-topbar">
          <div className="adm-topbar-search">
            <span className="adm-search-icon">🔍</span>
            <input
              className="adm-search-input"
              placeholder="Search curriculum…"
              aria-label="Search curriculum"
            />
          </div>

          <div className="adm-topbar-right">
            <button className="adm-icon-btn" aria-label="Notifications">🔔</button>
            <div className="adm-admin-chip">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || "Admin"}
                  className="adm-avatar"
                />
              ) : (
                <div className="adm-avatar-fallback">
                  {(user?.displayName || "A").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="adm-admin-info">
                <span className="adm-admin-name">{user?.displayName || "Admin"}</span>
                <span className="adm-admin-role">Administrator</span>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="adm-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
