import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import * as api from "../../api";
import NotificationsBell from "../../components/NotificationsPanel";

// ─────────────────────────────────────────────────────────────────────────────
// Mobile header (hamburger + PeerUp + notification + profile)
// ─────────────────────────────────────────────────────────────────────────────
function MobileHeader() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const name    = profile?.displayName || user?.displayName || "";
  const photo   = profile?.photoURL    || user?.photoURL    || "";
  const initial = name.trim()[0]?.toUpperCase() || "?";

  return (
    <div className="prog-mob-header">
      <div className="prog-mob-header-left">
        <button
          className="prog-mob-menu-btn"
          aria-label="Open menu"
          onClick={() => window.dispatchEvent(new CustomEvent("peerup:open-nav"))}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6"  x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <span className="prog-mob-logo">
          Peer<span className="prog-mob-accent">Up</span>
        </span>
      </div>
      <div className="prog-mob-header-right">
        <NotificationsBell className="prog-mob-bell notif-bell-btn" />
        <button
          className="prog-mob-avatar"
          onClick={() => navigate("/app/settings")}
          aria-label="Profile"
        >
          {photo
            ? <img src={photo} alt={name} referrerPolicy="no-referrer" />
            : <span>{initial}</span>
          }
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

const TABS = ["Overview", "Badges", "Certificates"];

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function Progress() {
  const [tab, setTab]       = useState("Overview");
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    // Try the new /api/progress endpoint first.
    // Falls back to profile data if backend hasn't deployed yet.
    api.getProgress()
      .then(d => { if (active) { setData(d); setLoading(false); } })
      .catch(() => {
        // Fallback: build progress from profile + existing APIs
        import("../../api").then(async (apiModule) => {
          try {
            const me = await apiModule.fetchMe();
            if (!active) return;
            const xp        = me?.xp ?? 0;
            const level     = me?.level;
            const streak    = me?.streak ?? 0;
            const sessions  = me?.sessionCount ?? 0;

            // Map xp to level number
            const levelNum = xp >= 1000 ? 5 : xp >= 600 ? 4 : xp >= 300 ? 3 : xp >= 100 ? 2 : 1;
            const levelName = level?.name ?? (xp >= 1000 ? "Master" : xp >= 600 ? "Expert" : xp >= 300 ? "Scholar" : xp >= 100 ? "Explorer" : "Beginner");
            const xpForNext = xp >= 1000 ? 1000 : xp >= 600 ? 1000 : xp >= 300 ? 600 : xp >= 100 ? 300 : 100;

            setData({
              xp,
              level: levelNum,
              levelName,
              xpForNext,
              dayStreak: streak,
              badgesEarned: 0,
              certificatesEarned: 0,
              sessionCount: sessions,
              allBadges: [],
              recentBadges: [],
              certificates: [],
              _fallback: true,
            });
          } catch {
            if (active) setError("Couldn't load progress. Please try again.");
          } finally {
            if (active) setLoading(false);
          }
        });
      });

    return () => { active = false; };
  }, []);

  // ── Loading ──
  if (loading) {
    return (
      <div className="home">
        <MobileHeader />
        <div className="home-head">
          <h1>Your Progress</h1>
          <p>Track your level, badges, and certificates as you learn.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 12, color: "var(--text-dim)" }}>
          <span className="discover-spinner" />
          Loading your progress…
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error || !data) {
    return (
      <div className="home">
        <MobileHeader />
        <div className="home-head">
          <h1>Your Progress</h1>
        </div>
        <div className="placeholder-card">
          <div className="placeholder-emoji">😕</div>
          <h3>Something went wrong</h3>
          <p>{error || "Unable to load progress data."}</p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 12 }}
            onClick={() => { setLoading(true); setError(null); api.getProgress().then(setData).catch(() => setError("Couldn't load progress. Please try again.")).finally(() => setLoading(false)); }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ── Computed values from real data ──
  const xp         = data.xp ?? 0;
  const level      = data.level ?? 1;
  const levelName  = data.levelName ?? "Beginner";
  const xpForNext  = data.xpForNext ?? 100;
  const dayStreak  = data.dayStreak ?? 0;
  const badgesEarned    = data.badgesEarned ?? 0;
  const certsEarned     = data.certificatesEarned ?? 0;
  const allBadges       = data.allBadges ?? [];
  const recentBadges    = data.recentBadges ?? [];
  const certificates    = data.certificates ?? [];

  const pct   = xpForNext > 0 ? Math.min(100, Math.round((xp / xpForNext) * 100)) : 100;
  const R     = 52;
  const C     = 2 * Math.PI * R;
  const dash  = (pct / 100) * C;

  return (
    <div className="home">
      {/* Mobile-only header */}
      <MobileHeader />

      <div className="home-head">
        <h1>Your Progress</h1>
        <p>Track your level, badges, and certificates as you learn.</p>
      </div>

      {/* Tabs */}
      <div className="seg-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={`seg-tab ${tab === t ? "active" : ""}`}
            type="button"
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {tab === "Overview" && (
        <>
          <div className="prog-grid">
            {/* Level ring card */}
            <div className="prog-level-card">
              <div className="ring-wrap">
                <svg viewBox="0 0 120 120" className="ring">
                  <circle cx="60" cy="60" r={R} className="ring-track" />
                  <circle
                    cx="60" cy="60" r={R}
                    className="ring-fill"
                    strokeDasharray={`${dash} ${C - dash}`}
                    strokeDashoffset={C * 0.25}
                  />
                </svg>
                <div className="ring-label">
                  <span className="ring-lv">Lv {level}</span>
                </div>
              </div>
              <div className="prog-level-info">
                <h2>Level {level}</h2>
                <p className="prog-level-title">{levelName}</p>
                <div className="prog-xp">
                  <div className="prog-xp-bar"><span style={{ width: `${pct}%` }} /></div>
                  <div className="prog-xp-nums">
                    <span>{xp} / {xpForNext} XP</span>
                    <span>{Math.max(0, xpForNext - xp)} XP to next</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Side stat cards */}
            <div className="prog-side">
              <div className="prog-stat">
                <span className="prog-stat-ic gold">🔥</span>
                <div>
                  <strong>{dayStreak}</strong>
                  <span>{dayStreak === 1 ? "Day streak" : "Day streak"}</span>
                </div>
              </div>
              <div className="prog-stat">
                <span className="prog-stat-ic blue">🏆</span>
                <div>
                  <strong>{badgesEarned}</strong>
                  <span>Badge{badgesEarned !== 1 ? "s" : ""} earned</span>
                </div>
              </div>
              <div className="prog-stat">
                <span className="prog-stat-ic purple">📜</span>
                <div>
                  <strong>{certsEarned}</strong>
                  <span>Certificate{certsEarned !== 1 ? "s" : ""}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Recent badges */}
          <section className="home-block" style={{ marginTop: 20 }}>
            <div className="home-block-head">
              <h2>Recent Badges</h2>
              <button className="link-btn" type="button" onClick={() => setTab("Badges")}>
                View all →
              </button>
            </div>
            {recentBadges.length === 0 ? (
              <p style={{ color: "var(--text-dim)", fontSize: "0.88rem", padding: "8px 0" }}>
                Complete a learning activity or study session to earn your first badge!
              </p>
            ) : (
              <div className="badge-row">
                {recentBadges.map((b) => (
                  <div key={b.id} className={`badge-chip ${b.earned ? "earned" : "locked"}`} title={b.name}>
                    <span className="badge-emoji">{b.emoji}</span>
                    <span className="badge-name">{b.name}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* ── Badges tab ── */}
      {tab === "Badges" && (
        <div className="badge-grid">
          {allBadges.length === 0 ? (
            <div className="placeholder-card">
              <div className="placeholder-emoji">🏆</div>
              <h3>No badges yet</h3>
              <p>Complete lessons, study sessions, and streaks to unlock badges.</p>
            </div>
          ) : (
            allBadges.map((b) => (
              <div key={b.id} className={`badge-card ${b.earned ? "earned" : "locked"}`}>
                <span className="badge-card-ic">{b.emoji}</span>
                <strong>{b.name}</strong>
                <span className="badge-card-desc">{b.desc}</span>
                {b.earned ? (
                  <span className="badge-status on">
                    Earned · {fmtDate(b.earnedAt)}
                  </span>
                ) : (
                  <span className="badge-status">Locked</span>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Certificates tab ── */}
      {tab === "Certificates" && (
        <>
          {certificates.length === 0 ? (
            <div className="placeholder-card">
              <div className="placeholder-emoji">📜</div>
              <h3>No certificates yet</h3>
              <p>Complete all lessons in a course to earn a certificate. It'll appear here automatically.</p>
            </div>
          ) : (
            <div className="cert-list">
              {certificates.map((c) => (
                <div key={c.id} className="cert-card">
                  <div className="cert-card-icon">📜</div>
                  <div className="cert-card-body">
                    <h3 className="cert-card-title">{c.courseName}</h3>
                    {c.subject && (
                      <span className="cert-card-subject">{c.subject}</span>
                    )}
                    <p className="cert-card-student">{c.studentName}</p>
                    <p className="cert-card-date">Issued {fmtDate(c.issuedAt)}</p>
                    <p className="cert-card-uid">Certificate ID: {c.certUid}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
