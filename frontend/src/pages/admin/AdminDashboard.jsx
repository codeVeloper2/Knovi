/**
 * AdminDashboard — /admin
 *
 * Shows real statistics from the database:
 *   - Total students, subjects, topics, questions, resources
 *   - Curriculum distribution by subject
 *   - Recent curriculum updates
 *   - Quick action buttons
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as api from "../../api";

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, color }) {
  return (
    <div className="adm-stat-card" style={{ "--stat-color": color }}>
      <div className="adm-stat-icon">{icon}</div>
      <div className="adm-stat-body">
        <span className="adm-stat-value">{value ?? "—"}</span>
        <span className="adm-stat-label">{label}</span>
      </div>
    </div>
  );
}

// ── Quick action button ───────────────────────────────────────────────────────
function QuickAction({ icon, label, to, onClick }) {
  const navigate = useNavigate();
  function handleClick() {
    if (onClick) { onClick(); return; }
    navigate(to);
  }
  return (
    <button className="adm-quick-btn" onClick={handleClick}>
      <span className="adm-quick-icon">{icon}</span>
      <span className="adm-quick-label">{label}</span>
    </button>
  );
}

// ── Seed banner (shown when subject count is 0) ───────────────────────────────
function SeedBanner() {
  return (
    <div className="adm-seed-banner">
      <span className="adm-seed-icon">🌱</span>
      <div>
        <p className="adm-seed-title">No subjects yet</p>
        <p className="adm-seed-sub">
          Use the{" "}
          <a href="/admin/curriculum/subjects" className="adm-seed-link">
            Subjects page
          </a>{" "}
          to create your first subject (e.g. Mathematics, Physics, Chemistry).
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function loadDashboard() {
    setError("");
    try {
      const data = await api.adminGetDashboard();
      setStats(data);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  if (error) {
    return (
      <div className="adm-page-error">
        <p>⚠️ {error}</p>
        <button className="adm-btn-primary" onClick={loadDashboard}>Retry</button>
      </div>
    );
  }

  const dist = stats?.curriculum_distribution ?? [];
  const recent = stats?.recent_updates ?? [];

  return (
    <div className="adm-page">
      {/* Page header */}
      <div className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Dashboard</h1>
          <p className="adm-page-sub">Welcome back, Administrator</p>
        </div>
      </div>

      {/* Seed banner when no subjects */}
      {stats && stats.total_subjects === 0 && (
        <SeedBanner />
      )}

      {/* Stat cards */}
      <div className="adm-stats-grid">
        <StatCard label="Total Students"  value={stats?.total_students}  icon="👩‍🎓" color="var(--blue)" />
        <StatCard label="Total Subjects"  value={stats?.total_subjects}  icon="📚"  color="var(--teal)" />
        <StatCard label="Total Topics"    value={stats?.total_topics}    icon="📝"  color="var(--purple)" />
        <StatCard label="Total Questions" value={stats?.total_questions} icon="❓"  color="var(--gold)" />
        <StatCard label="Total Resources" value={stats?.total_resources} icon="🎬"  color="#f472b6" />
      </div>

      <div className="adm-dash-grid">
        {/* Curriculum distribution */}
        <section className="adm-card">
          <h2 className="adm-card-title">Curriculum Overview</h2>
          {dist.length === 0 ? (
            <p className="adm-empty-hint">No subjects yet.</p>
          ) : (
            <ul className="adm-dist-list">
              {dist.map((d) => (
                <li key={d.subject} className="adm-dist-item">
                  <span className="adm-dist-icon">{d.icon || "📚"}</span>
                  <div className="adm-dist-info">
                    <span className="adm-dist-name">{d.subject}</span>
                    <span className="adm-dist-count">
                      {d.topic_count} topic{d.topic_count !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <Link
                    to={`/admin/curriculum/topics`}
                    className="adm-dist-link"
                  >
                    View →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Quick actions */}
        <section className="adm-card">
          <h2 className="adm-card-title">Quick Actions</h2>
          <div className="adm-quick-grid">
            <QuickAction icon="📚" label="Add Subject"      to="/admin/curriculum/subjects" />
            <QuickAction icon="📝" label="Add Topic"        to="/admin/curriculum/topics/new" />
            <QuickAction icon="❓" label="Add Question"     to="/admin/curriculum/topics" />
            <QuickAction icon="🎬" label="Manage Resources" to="/admin/curriculum/resources" />
            <QuickAction icon="📋" label="View All Content" to="/admin/curriculum/topics" />
          </div>
        </section>
      </div>

      {/* Recent updates */}
      <section className="adm-card adm-card-wide">
        <h2 className="adm-card-title">Recent Curriculum Updates</h2>
        {recent.length === 0 ? (
          <p className="adm-empty-hint">No curriculum content yet. Create a topic to get started.</p>
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th>Topic</th>
                <th>Subject</th>
                <th>Last Updated</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((item) => (
                <tr key={item.id}>
                  <td className="adm-table-name">{item.name}</td>
                  <td>
                    <span className="adm-tag">{item.subject}</span>
                  </td>
                  <td className="adm-table-date">
                    {new Date(item.updated_at).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </td>
                  <td>
                    <Link
                      to={`/admin/curriculum/topics/${item.id}`}
                      className="adm-table-action"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
