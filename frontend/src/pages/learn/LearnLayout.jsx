import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useEffect, useState } from "react";
import * as api from "../../api";
import "../../styles/learn-interface.css";

const LEARN_NAV = [
  {
    to: "/app/learn",
    label: "Subjects",
    exact: true,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4.5h9.5A3.5 3.5 0 0 1 18 8v11.5H8.5A3.5 3.5 0 0 0 5 23V4.5Z"/>
        <path d="M5 19.5h9.5A3.5 3.5 0 0 1 18 23"/>
        <path d="M9 8h5M9 11h5"/>
      </svg>
    ),
  },
  {
    to: "/app/learn/sessions",
    label: "Study Sessions",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="3"/>
        <path d="M8 9h8M8 13h5M8 17h3"/>
        <path d="M17 14v3M17 17h-2"/>
      </svg>
    ),
  },
  {
    to: "/app/learn/saved",
    label: "Saved Resources",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3.5h10v17l-5-3-5 3v-17Z"/>
        <path d="M9 8h6M9 11h6"/>
      </svg>
    ),
  },
  {
    to: "/app/learn/path",
    label: "Learning Path",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="6" cy="18" r="2.5"/>
        <circle cx="18" cy="6" r="2.5"/>
        <circle cx="18" cy="18" r="2.5"/>
        <path d="M8.5 17.5h5a4.5 4.5 0 0 0 4.5-4.5V8.5"/>
      </svg>
    ),
  },
];

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h11v16H7a2.5 2.5 0 0 0-2.5 2.5v-16Z"/>
      <path d="M7 19h11M8 7h7M8 10h6"/>
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 5 7 7-7 7"/>
    </svg>
  );
}

function SparkleRobot() {
  return (
    <div className="learn-robot-wrap" aria-hidden="true">
      <span className="learn-spark s1">✦</span>
      <span className="learn-spark s2">✦</span>
      <span className="learn-spark s3">•</span>
      <div className="learn-robot">
        <div className="robot-antenna"><i /></div>
        <div className="robot-head">
          <div className="robot-face">
            <span />
            <span />
            <b />
          </div>
        </div>
        <div className="robot-body">
          <div className="robot-core" />
        </div>
        <div className="robot-wing left" />
        <div className="robot-wing right" />
      </div>
    </div>
  );
}

export default function LearnLayout() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAISessionRoom = location.pathname.includes("/app/learn/ai/session/");

  const [lastSession, setLastSession] = useState(null);

  const name = profile?.displayName || user?.displayName || "there";
  const photo = profile?.photoURL || user?.photoURL || "";
  const initial = name.trim().slice(0, 1).toUpperCase() || "?";

  useEffect(() => {
    let alive = true;
    api.getAISessions({ limit: 10, offset: 0 })
      .then(rows => {
        if (!alive || !Array.isArray(rows)) return;
        const active = rows.find(x => x.status !== "completed" && x.status !== "abandoned");
        setLastSession(active || rows[0] || null);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [location.pathname]);

  const resume = () => {
    if (lastSession?.id) navigate(`/app/learn/ai/session/${lastSession.id}`);
    else navigate("/app/learn");
  };

  return (
    <div className="learn-shell">
      <aside className="learn-sidebar">
        <div className="learn-sidebar-brand">
          <div className="learn-sidebar-brand-icon"><BookIcon /></div>
          <div>
            <div className="learn-sidebar-title">Learn</div>
            <div className="learn-sidebar-subtitle">Your AI-powered learning space</div>
          </div>
        </div>

        <nav className="learn-sidebar-nav" aria-label="Learn navigation">
          {LEARN_NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) => `learn-side-link${isActive ? " active" : ""}`}
            >
              <span className="learn-side-icon">{item.icon}</span>
              <span>{item.label}</span>
              <span className="learn-side-arrow"><ChevronRight /></span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="learn-main">
        <Outlet context={{ lastSession }} />

        {/* Learn tools dock — sits above the global app navigation on small screens */}
        {!isAISessionRoom && (
          <nav className="learn-mobile-dock" aria-label="Learn tools">
            {LEARN_NAV.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                className={({ isActive }) => `learn-mobile-dock-item${isActive ? " active" : ""}`}
              >
                <span className="learn-mobile-dock-icon">{item.icon}</span>
                <span className="learn-mobile-dock-label">
                  {item.label === "Study Sessions" ? "Sessions" :
                   item.label === "Saved Resources" ? "Saved" :
                   item.label === "Learning Path" ? "Path" : "Subjects"}
                </span>
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
