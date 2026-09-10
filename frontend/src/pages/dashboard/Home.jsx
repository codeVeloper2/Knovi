import { useAuth } from "../../context/AuthContext";
import { ChevronRight } from "../../components/DashIcons";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// Placeholder matches — will be replaced by real matching data later.
const MATCHES = [
  { name: "Sarah M.", detail: "Math · 11th Grade", online: true, color: "#f59e0b" },
  { name: "James T.", detail: "Physics · 12th Grade", online: true, color: "#34d399" },
  { name: "Aisha K.", detail: "Chemistry · 10th Grade", online: false, color: "#a78bfa" },
];

export default function Home() {
  const { user, profile } = useAuth();
  const firstName = (profile?.displayName || user?.displayName || "there").split(" ")[0];

  return (
    <div className="home">
      <div className="home-head">
        <h1>{greeting()}, {firstName}! 👋</h1>
        <p>Keep going — your goals are within reach.</p>
      </div>

      {/* Stat cards */}
      <div className="stat-cards">
        <div className="stat-card stat-card--teal">
          <div className="stat-ic">🎯</div>
          <div className="stat-info">
            <strong>Level 1</strong>
            <span>Rising Learner</span>
          </div>
          <ChevronRight width={16} height={16} className="stat-arrow" />
        </div>
        <div className="stat-card stat-card--gold">
          <div className="stat-ic">🔥</div>
          <div className="stat-info">
            <strong>0 XP</strong>
            <span>Next level: 100 XP</span>
          </div>
          <ChevronRight width={16} height={16} className="stat-arrow" />
        </div>
        <div className="stat-card stat-card--blue">
          <div className="stat-ic">⚡</div>
          <div className="stat-info">
            <strong>0 Day</strong>
            <span>Study streak</span>
          </div>
          <ChevronRight width={16} height={16} className="stat-arrow" />
        </div>
      </div>

      {/* Two-column: Continue Learning + Matches */}
      <div className="home-grid">
        <section className="home-block">
          <div className="home-block-head">
            <h2>Continue Learning</h2>
          </div>
          <div className="learn-card">
            <div className="learn-icon">📘</div>
            <div className="learn-info">
              <strong>Get started</strong>
              <span>Find a study partner to begin your first session</span>
            </div>
          </div>
          <div className="learn-empty">
            Your sessions and courses will show up here once you start learning.
          </div>
        </section>

        <section className="home-block">
          <div className="home-block-head">
            <h2>Your Matches</h2>
            <button className="link-btn" type="button">View all</button>
          </div>
          <ul className="match-list">
            {MATCHES.map((m) => (
              <li key={m.name} className="match-row">
                <span className="match-av" style={{ background: m.color }}>{m.name[0]}</span>
                <div className="match-info">
                  <strong>{m.name}</strong>
                  <span>{m.detail}</span>
                  {m.online && <span className="match-online">Online now</span>}
                </div>
                <ChevronRight width={16} height={16} className="match-arrow" />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
