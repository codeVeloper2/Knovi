import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const NAV = [
  { to: "/app/learn",             label: "Home",        end: true },
  { to: "/app/learn/courses",     label: "Courses"            },
  { to: "/app/learn/tutorials",   label: "Tutorials"          },
  { to: "/app/learn/my-learning", label: "My Learning"        },
  { to: "/app/learn/saved",       label: "Saved"              },
];

export default function LearnLayout() {
  const navigate = useNavigate();
  return (
    <div className="ll-shell">
      {/* Sub-nav */}
      <nav className="ll-subnav">
        <div className="ll-subnav-inner">
          {NAV.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `ll-navlink ${isActive ? "active" : ""}`}
            >
              {n.label}
            </NavLink>
          ))}
          <button
            type="button"
            className="ll-upload-btn"
            onClick={() => navigate("/app/learn/create")}
          >
            + Upload Tutorial
          </button>
        </div>
      </nav>
      {/* Page content */}
      <div className="ll-content">
        <Outlet />
      </div>
    </div>
  );
}
