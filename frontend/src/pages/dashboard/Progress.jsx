import { useState } from "react";

/* Placeholder gamification data — wire to a real backend later. */
const PROGRESS = {
  level: 1,
  title: "Rising Learner",
  xp: 0,
  xpForNext: 100,
  dayStreak: 0,
  badgesEarned: 0,
  certificates: 0,
};

const RECENT_BADGES = [
  { id: 1, name: "First Steps", emoji: "🎯", earned: false },
  { id: 2, name: "Team Player", emoji: "🤝", earned: false },
  { id: 3, name: "Quick Learner", emoji: "⚡", earned: false },
  { id: 4, name: "Top Helper", emoji: "🏅", earned: false },
];

const ALL_BADGES = [
  { id: 1, name: "First Steps", emoji: "🎯", desc: "Complete your first study session", earned: false },
  { id: 2, name: "Team Player", emoji: "🤝", desc: "Help 5 classmates", earned: false },
  { id: 3, name: "Quick Learner", emoji: "⚡", desc: "Finish 10 sessions", earned: false },
  { id: 4, name: "Top Helper", emoji: "🏅", desc: "Reach a 4.5+ rating", earned: false },
  { id: 5, name: "Streak Master", emoji: "🔥", desc: "Maintain a 7-day streak", earned: false },
  { id: 6, name: "Scholar", emoji: "🎓", desc: "Earn your first certificate", earned: false },
];

const TABS = ["Overview", "Badges", "Certificates"];

export default function Progress() {
  const [tab, setTab] = useState("Overview");
  const pct = Math.min(100, Math.round((PROGRESS.xp / PROGRESS.xpForNext) * 100));
  // ring math: circumference for r=52
  const R = 52;
  const C = 2 * Math.PI * R;
  const dash = (pct / 100) * C;

  return (
    <div className="home">
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
                  <span className="ring-lv">Lv {PROGRESS.level}</span>
                </div>
              </div>
              <div className="prog-level-info">
                <h2>Level {PROGRESS.level}</h2>
                <p className="prog-level-title">{PROGRESS.title}</p>
                <div className="prog-xp">
                  <div className="prog-xp-bar"><span style={{ width: `${pct}%` }} /></div>
                  <div className="prog-xp-nums">
                    <span>{PROGRESS.xp} / {PROGRESS.xpForNext} XP</span>
                    <span>{PROGRESS.xpForNext - PROGRESS.xp} XP to next</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Side stat cards */}
            <div className="prog-side">
              <div className="prog-stat">
                <span className="prog-stat-ic gold">🔥</span>
                <div><strong>{PROGRESS.dayStreak}</strong><span>Day streak</span></div>
              </div>
              <div className="prog-stat">
                <span className="prog-stat-ic blue">🏆</span>
                <div><strong>{PROGRESS.badgesEarned}</strong><span>Badges earned</span></div>
              </div>
              <div className="prog-stat">
                <span className="prog-stat-ic purple">📜</span>
                <div><strong>{PROGRESS.certificates}</strong><span>Certificates</span></div>
              </div>
            </div>
          </div>

          {/* Recent badges */}
          <section className="home-block" style={{ marginTop: 20 }}>
            <div className="home-block-head">
              <h2>Recent Badges</h2>
              <button className="link-btn" type="button" onClick={() => setTab("Badges")}>View all →</button>
            </div>
            <div className="badge-row">
              {RECENT_BADGES.map((b) => (
                <div key={b.id} className={`badge-chip ${b.earned ? "earned" : "locked"}`} title={b.name}>
                  <span className="badge-emoji">{b.emoji}</span>
                  <span className="badge-name">{b.name}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {tab === "Badges" && (
        <div className="badge-grid">
          {ALL_BADGES.map((b) => (
            <div key={b.id} className={`badge-card ${b.earned ? "earned" : "locked"}`}>
              <span className="badge-card-ic">{b.emoji}</span>
              <strong>{b.name}</strong>
              <span className="badge-card-desc">{b.desc}</span>
              <span className={`badge-status ${b.earned ? "on" : ""}`}>{b.earned ? "Earned" : "Locked"}</span>
            </div>
          ))}
        </div>
      )}

      {tab === "Certificates" && (
        <div className="placeholder-card">
          <div className="placeholder-emoji">📜</div>
          <h3>No certificates yet</h3>
          <p>Complete courses and study milestones to earn certificates. They'll appear here.</p>
        </div>
      )}
    </div>
  );
}
