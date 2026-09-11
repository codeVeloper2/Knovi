import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import * as api from "../../api";
import { ChevronRight } from "../../components/DashIcons";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth <= 768);
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return mobile;
}

function levelLabel(xp) {
  if (xp >= 1000) return "Master";
  if (xp >= 600) return "Expert";
  if (xp >= 300) return "Scholar";
  if (xp >= 100) return "Explorer";
  return "Beginner";
}

function nextLevelXp(xp) {
  if (xp >= 1000) return null;
  if (xp >= 600) return 1000;
  if (xp >= 300) return 600;
  if (xp >= 100) return 300;
  return 100;
}

function avatarColor(str) {
  const colors = ["#f59e0b", "#34d399", "#a78bfa", "#60a5fa", "#f472b6", "#fb923c"];
  let h = 0;
  for (let i = 0; i < (str || "").length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

function Avatar({ name, photo, size = 36 }) {
  const initials = (name || "?")[0].toUpperCase();
  if (photo) {
    return <img src={photo} alt={name} referrerPolicy="no-referrer" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />;
  }
  return (
    <span style={{
      width: size, height: size, borderRadius: "50%",
      background: avatarColor(name), display: "flex",
      alignItems: "center", justifyContent: "center",
      fontWeight: 700, fontSize: size * 0.4, color: "#fff", flexShrink: 0,
    }}>{initials}</span>
  );
}

function ProgressBar({ pct }) {
  return (
    <div className="mdash-progress-bar">
      <div className="mdash-progress-fill" style={{ width: `${Math.min(100, pct || 0)}%` }} />
    </div>
  );
}

// ── Mobile Home ────────────────────────────────────────────────────────────

function MobileHome({ profile, user, connections, learning, learnHome, loading, navigate, onOpenMenu }) {
  const name = profile?.displayName || user?.displayName || "";
  const firstName = name.split(" ")[0] || "there";
  const photo = profile?.photoURL || user?.photoURL || "";
  const xp = profile?.xp || 0;
  const level = profile?.level?.name || levelLabel(xp);
  const nextXp = nextLevelXp(xp);
  const xpPct = nextXp ? Math.min(100, Math.round((xp / nextXp) * 100)) : 100;
  const rating = profile?.rating ? profile.rating.toFixed(1) : "0.0";
  const subjectCount = ((profile?.subjectsGoodAt || []).length + (profile?.subjectsNeedHelp || []).length);
  const sessionCount = profile?.sessionCount || 0;
  const streak = profile?.streak || 0;

  const inProgress = learning?.inProgress || [];
  const history = learning?.history || [];
  const recommended = learnHome?.recommended || learnHome?.popularCourses || [];
  const continueWatching = learnHome?.continueWatching || [];

  const continueLearning = continueWatching.length > 0 ? continueWatching : inProgress.slice(0, 3);

  // Build mock-style "recent activity" messages from history
  const recentActivity = history.slice(0, 4).map((item, i) => ({
    icon: item.type === "tutorial" ? "▶" : item.type === "message" ? "💬" : item.type === "room" ? "👥" : "⭐",
    iconClass: item.type === "tutorial" ? "mdash-act-ic--play" : item.type === "message" ? "mdash-act-ic--msg" : item.type === "room" ? "mdash-act-ic--room" : "mdash-act-ic--star",
    text: item.activityText || `You studied ${item.title}`,
    time: item.timeAgo || "",
    key: item.id ?? i,
  }));

  return (
    <div className="mdash-wrap">
      {/* ── Header ── */}
      <div className="mdash-header">
        <div className="mdash-header-left">
          <button className="mdash-menu-btn" aria-label="Open menu" onClick={onOpenMenu}>
            <HamburgerSvg />
          </button>
          <span className="mdash-logo-text">Peer<span className="mdash-logo-accent">Up</span></span>
        </div>
        <div className="mdash-header-right">
          <button className="mdash-bell-btn" aria-label="Notifications" onClick={() => navigate("/app/settings/notifications")}>
            <BellSvg />
          </button>
          <button className="mdash-avatar-btn" onClick={() => navigate("/app/settings")} aria-label="Profile">
            <Avatar name={name} photo={photo} size={36} />
          </button>
        </div>
      </div>

      {/* ── Greeting ── */}
      <div className="mdash-greeting">
        <h1 className="mdash-greeting-title">{greeting()}, <span className="mdash-greeting-name">{firstName}!</span> 👋</h1>
        <p className="mdash-greeting-sub">Keep going — your goals are within reach.</p>
      </div>

      {/* ── Profile / Level card ── */}
      <div className="mdash-profile-card">
        <div className="mdash-profile-left">
          <div className="mdash-profile-avatar">
            <Avatar name={name} photo={photo} size={60} />
          </div>
          <div className="mdash-profile-meta">
            <div className="mdash-profile-level-row">
              <span className="mdash-profile-level-ic">⚙</span>
              <span className="mdash-profile-level">Level {Math.max(1, Math.floor(xp / 100) + 1)}</span>
            </div>
            <span className="mdash-profile-label">{level}</span>
            <div className="mdash-profile-xp-row">
              <ProgressBar pct={xpPct} />
            </div>
            <span className="mdash-profile-xp-text">{xp} / {nextXp ?? xp} XP <span className="mdash-profile-xp-pct">{xpPct}%</span></span>
          </div>
        </div>
        <div className="mdash-profile-stats">
          <div className="mdash-profile-stat">
            <span className="mdash-profile-stat-ic">🔥</span>
            <span className="mdash-profile-stat-val">{streak}</span>
            <span className="mdash-profile-stat-lbl">Day streak</span>
          </div>
          <div className="mdash-profile-stat">
            <span className="mdash-profile-stat-ic">📚</span>
            <span className="mdash-profile-stat-val">{subjectCount || "—"}</span>
            <span className="mdash-profile-stat-lbl">Subjects</span>
          </div>
          <div className="mdash-profile-stat">
            <span className="mdash-profile-stat-ic">⭐</span>
            <span className="mdash-profile-stat-val">{rating}</span>
            <span className="mdash-profile-stat-lbl">Avg. rating</span>
          </div>
        </div>
      </div>

      {/* ── Quick Actions (5 in a row) ── */}
      <div className="mdash-quick-actions">
        <button className="mdash-qa-btn" onClick={() => navigate("/app/discover")}>
          <span className="mdash-qa-icon mdash-qa-icon--blue"><DiscoverSvg /></span>
          <span>Find Study Partners</span>
        </button>
        <button className="mdash-qa-btn" onClick={() => navigate("/app/rooms")}>
          <span className="mdash-qa-icon mdash-qa-icon--indigo"><RoomSvg /></span>
          <span>Join Study Room</span>
        </button>
        <button className="mdash-qa-btn" onClick={() => navigate("/app/learn")}>
          <span className="mdash-qa-icon mdash-qa-icon--purple"><LearnSvg /></span>
          <span>Browse Courses</span>
        </button>
        <button className="mdash-qa-btn" onClick={() => navigate("/app/learn")}>
          <span className="mdash-qa-icon mdash-qa-icon--red"><TutorialSvg /></span>
          <span>Watch Tutorials</span>
        </button>
        <button className="mdash-qa-btn" onClick={() => navigate("/app/learn")}>
          <span className="mdash-qa-icon mdash-qa-icon--teal"><UploadSvg /></span>
          <span>Upload Tutorial</span>
        </button>
      </div>

      {/* ── Continue Learning ── */}
      <section className="mdash-section">
        <div className="mdash-section-head">
          <h2 className="mdash-section-title">Continue Learning</h2>
          <Link to="/app/learn" className="mdash-see-all">See all →</Link>
        </div>
        {loading ? (
          <div className="mdash-shimmer-list">
            <div className="mdash-shimmer-card" /><div className="mdash-shimmer-card" />
          </div>
        ) : continueLearning.length === 0 ? (
          <div className="mdash-empty">
            <p>No courses in progress yet.</p>
            <button className="mdash-empty-btn" onClick={() => navigate("/app/learn")}>Browse courses</button>
          </div>
        ) : (
          <div className="mdash-learn-list">
            {continueLearning.slice(0, 3).map((item, i) => {
              const pct = Math.round(item.percentage ?? item.progressPct ?? 0);
              return (
                <button key={item.id ?? i} className="mdash-learn-card"
                  onClick={() => navigate(item.type === "tutorial" ? `/app/learn/tutorials/${item.id}` : `/app/learn/courses/${item.courseId ?? item.id}`)}>
                  <div className="mdash-learn-thumb">
                    {item.thumbnailUrl
                      ? <img src={item.thumbnailUrl} alt={item.title} />
                      : <span className="mdash-learn-thumb-fallback">📘</span>}
                    {item.duration && <span className="mdash-learn-duration">{item.duration}</span>}
                  </div>
                  <div className="mdash-learn-info">
                    <strong className="mdash-learn-title">{item.title}</strong>
                    {item.subject && (
                      <span className="mdash-learn-subject-row">
                        <span className="mdash-learn-subject-dot" />
                        <span className="mdash-learn-subject">{item.subject}</span>
                      </span>
                    )}
                    {item.rating && (
                      <span className="mdash-learn-rating">⭐ {item.rating} ({item.ratingCount ?? 0})</span>
                    )}
                    <div className="mdash-learn-bar-row">
                      <ProgressBar pct={pct} />
                      <span className="mdash-learn-pct">{pct}%</span>
                    </div>
                  </div>
                  <ChevronRight width={16} height={16} className="mdash-learn-arrow" />
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Recommended for You ── */}
      {(loading || recommended.length > 0) && (
        <section className="mdash-section">
          <div className="mdash-section-head">
            <h2 className="mdash-section-title">Recommended for You</h2>
            <Link to="/app/learn" className="mdash-see-all">See all →</Link>
          </div>
          {loading ? (
            <div className="mdash-shimmer-list">
              <div className="mdash-shimmer-card" /><div className="mdash-shimmer-card" />
            </div>
          ) : (
            <div className="mdash-learn-list">
              {recommended.slice(0, 3).map((course, i) => (
                <button key={course.id ?? i} className="mdash-learn-card"
                  onClick={() => navigate(`/app/learn/courses/${course.id}`)}>
                  <div className="mdash-learn-thumb mdash-learn-thumb--rec">
                    {course.thumbnailUrl
                      ? <img src={course.thumbnailUrl} alt={course.title} />
                      : <span className="mdash-learn-thumb-fallback">🎓</span>}
                  </div>
                  <div className="mdash-learn-info">
                    <strong className="mdash-learn-title">{course.title}</strong>
                    {course.subject && (
                      <span className="mdash-learn-subject-row">
                        <span className="mdash-learn-subject-dot" />
                        <span className="mdash-learn-subject">{course.subject}</span>
                      </span>
                    )}
                    {course.trending && <span className="mdash-learn-badge mdash-learn-badge--trend">Trending</span>}
                    {course.isNew && <span className="mdash-learn-badge mdash-learn-badge--new">New</span>}
                  </div>
                  <ChevronRight width={16} height={16} className="mdash-learn-arrow" />
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Your Matches ── */}
      <section className="mdash-section">
        <div className="mdash-section-head">
          <h2 className="mdash-section-title">Your Matches</h2>
          <Link to="/app/match-requests" className="mdash-see-all">See all →</Link>
        </div>
        {loading ? (
          <div className="mdash-shimmer-list">
            <div className="mdash-shimmer-row" /><div className="mdash-shimmer-row" />
          </div>
        ) : connections.length === 0 ? (
          <div className="mdash-empty">
            <p>No connections yet. Accept a friend request to start chatting!</p>
            <button className="mdash-empty-btn" onClick={() => navigate("/app/discover")}>Find peers</button>
          </div>
        ) : (
          <div className="mdash-match-list">
            {connections.slice(0, 5).map((conn) => (
              <div key={conn.partnerId} className="mdash-match-row">
                <Avatar name={conn.displayName} photo={conn.photoURL} size={44} />
                <div className="mdash-match-info">
                  <strong className="mdash-match-name">{conn.displayName}</strong>
                  <span className="mdash-match-detail">
                    {[conn.subject, conn.grade].filter(Boolean).join(" · ") || "Peer"}
                  </span>
                  {conn.isOnline && (
                    <span className="mdash-match-online"><span className="mdash-online-dot" />Online</span>
                  )}
                </div>
                <button className="mdash-match-chat-btn"
                  onClick={() => conn.conversationId ? navigate(`/app/chat/${conn.conversationId}`) : navigate("/app/chat")}>
                  <ChatSvg /> Chat
                </button>
                <ChevronRight width={14} height={14} className="mdash-match-arrow" />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Learning Journey Banner ── */}
      <div className="mdash-journey-banner" onClick={() => navigate("/app/progress")}>
        <div className="mdash-journey-text">
          <strong>Continue your learning journey</strong>
          <span>Take a course, watch a tutorial, or find a study partner.</span>
          <button className="mdash-journey-btn" onClick={(e) => { e.stopPropagation(); navigate("/app/learn"); }}>
            Explore Now →
          </button>
        </div>
        <div className="mdash-journey-pills">
          <span>Learn</span>
          <span>Practice</span>
          <span>Discuss</span>
          <span>Grow</span>
        </div>
      </div>

      {/* ── Recent Activity ── */}
      {(loading || history.length > 0) && (
        <section className="mdash-section">
          <div className="mdash-section-head">
            <h2 className="mdash-section-title">Recent Activity</h2>
            <Link to="/app/progress" className="mdash-see-all">See all →</Link>
          </div>
          {loading ? (
            <div className="mdash-shimmer-list">
              <div className="mdash-shimmer-row" /><div className="mdash-shimmer-row" /><div className="mdash-shimmer-row" />
            </div>
          ) : (
            <div className="mdash-activity-list">
              {history.slice(0, 4).map((item, i) => (
                <div key={item.id ?? i} className="mdash-activity-item">
                  <span className={`mdash-act-ic mdash-act-ic--${item.type === "tutorial" ? "play" : item.type === "message" ? "msg" : item.type === "room" ? "room" : "star"}`}>
                    {item.type === "tutorial" ? <PlaySvg /> : item.type === "message" ? <ChatSvg /> : item.type === "room" ? <RoomSvg /> : <StarSvg />}
                  </span>
                  <div className="mdash-activity-info">
                    <strong>{item.activityText || `You studied ${item.title}`}</strong>
                    {item.timeAgo && <span className="mdash-activity-time">{item.timeAgo}</span>}
                  </div>
                  <ChevronRight width={14} height={14} className="mdash-activity-arrow" />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Upcoming Events ── */}
      <section className="mdash-section">
        <div className="mdash-section-head">
          <h2 className="mdash-section-title">Upcoming Events</h2>
          <Link to="/app/rooms" className="mdash-see-all">See all →</Link>
        </div>
        <div className="mdash-events-list">
          {connections.slice(0, 2).map((conn, i) => (
            <div key={conn.partnerId ?? i} className="mdash-event-row">
              <div className="mdash-event-date">
                <span className="mdash-event-month">APR</span>
                <span className="mdash-event-day">{25 + i}</span>
              </div>
              <div className="mdash-event-info">
                <strong className="mdash-event-title">{conn.subject || "Study"} Study Group</strong>
                <span className="mdash-event-meta">Hosted by {conn.displayName} · 6:00 PM – 7:30 PM</span>
              </div>
              <button className="mdash-event-join-btn" onClick={() => navigate("/app/rooms")}>
                Join
              </button>
              <ChevronRight width={14} height={14} className="mdash-event-arrow" />
            </div>
          ))}
          {connections.length === 0 && (
            <div className="mdash-empty">
              <p>No upcoming events.</p>
              <button className="mdash-empty-btn" onClick={() => navigate("/app/rooms")}>Browse rooms</button>
            </div>
          )}
        </div>
      </section>

      {/* ── Become a Creator CTA ── */}
      <div className="mdash-creator-cta" onClick={() => navigate("/app/learn")}>
        <div className="mdash-creator-icon">⚡</div>
        <div className="mdash-creator-text">
          <strong>Become a Creator</strong>
          <span>Share your knowledge. Help other students. Earn XP.</span>
        </div>
        <button className="mdash-creator-btn" onClick={(e) => { e.stopPropagation(); navigate("/app/learn"); }}>
          Upload Tutorial →
        </button>
      </div>

      {/* Bottom padding */}
      <div style={{ height: 32 }} />
    </div>
  );
}

// ── Desktop Home ────────────────────────────────────────────────────────────

function DesktopHome({ profile, user, connections, learning, loading }) {
  const navigate = useNavigate();
  const firstName = (profile?.displayName || user?.displayName || "there").split(" ")[0];
  const xp = profile?.xp || 0;
  const level = profile?.level?.name || levelLabel(xp);
  const nextXp = nextLevelXp(xp);
  const sessionCount = profile?.sessionCount || 0;

  const inProgress = learning?.inProgress || [];

  return (
    <div className="home">
      <div className="home-head">
        <h1>{greeting()}, {firstName}! 👋</h1>
        <p>Keep going — your goals are within reach.</p>
      </div>

      <div className="stat-cards">
        <div className="stat-card stat-card--teal">
          <div className="stat-ic">🎯</div>
          <div className="stat-info">
            <strong>{level}</strong>
            <span>{xp} XP</span>
          </div>
          <ChevronRight width={16} height={16} className="stat-arrow" />
        </div>
        <div className="stat-card stat-card--gold">
          <div className="stat-ic">🔥</div>
          <div className="stat-info">
            <strong>{xp.toLocaleString()} XP</strong>
            <span>{nextXp ? `Next level: ${nextXp} XP` : "Max level reached!"}</span>
          </div>
          <ChevronRight width={16} height={16} className="stat-arrow" />
        </div>
        <div className="stat-card stat-card--blue">
          <div className="stat-ic">⚡</div>
          <div className="stat-info">
            <strong>{sessionCount} Session{sessionCount !== 1 ? "s" : ""}</strong>
            <span>Study sessions completed</span>
          </div>
          <ChevronRight width={16} height={16} className="stat-arrow" />
        </div>
      </div>

      <div className="home-grid">
        <section className="home-block">
          <div className="home-block-head">
            <h2>Continue Learning</h2>
            <Link to="/app/learn" className="link-btn">View all</Link>
          </div>
          {loading ? (
            <div className="learn-empty">Loading…</div>
          ) : inProgress.length === 0 ? (
            <>
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
            </>
          ) : (
            inProgress.slice(0, 3).map((course, i) => (
              <button key={course.id ?? i} className="learn-card" style={{ textAlign: "left", cursor: "pointer", border: "none", background: "none", width: "100%", padding: 0 }}
                onClick={() => navigate(`/app/learn/courses/${course.id}`)}>
                <div className="learn-icon">📘</div>
                <div className="learn-info">
                  <strong>{course.title}</strong>
                  <span>{course.subject} · {Math.round(course.progressPct || 0)}% complete</span>
                </div>
              </button>
            ))
          )}
        </section>

        <section className="home-block">
          <div className="home-block-head">
            <h2>Your Connections</h2>
            <Link to="/app/match-requests" className="link-btn">View all</Link>
          </div>
          {loading ? (
            <div className="learn-empty">Loading…</div>
          ) : connections.length === 0 ? (
            <div className="learn-empty">
              No connections yet. Accept a friend request to start chatting!
            </div>
          ) : (
            <ul className="match-list">
              {connections.slice(0, 5).map((conn) => (
                <li key={conn.partnerId} className="match-row" style={{ cursor: "pointer" }}
                  onClick={() => conn.conversationId ? navigate(`/app/chat/${conn.conversationId}`) : navigate("/app/chat")}>
                  <span className="match-av" style={{ background: avatarColor(conn.displayName) }}>
                    {conn.photoURL
                      ? <img src={conn.photoURL} alt={conn.displayName} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} referrerPolicy="no-referrer" />
                      : (conn.displayName || "?")[0]}
                  </span>
                  <div className="match-info">
                    <strong>{conn.displayName}</strong>
                    <span>{[conn.subject, conn.grade].filter(Boolean).join(" · ") || "Peer"}</span>
                    {conn.isOnline && <span className="match-online">Online now</span>}
                  </div>
                  <ChevronRight width={16} height={16} className="match-arrow" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Main export ─────────────────────────────────────────────────────────────

export default function Home() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [connections, setConnections] = useState([]);
  const [learning, setLearning] = useState(null);
  const [learnHome, setLearnHome] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const [connRes, learningRes, homeRes] = await Promise.allSettled([
        api.getAcceptedMatchPartners(),
        api.getMyLearning(),
        api.getLearnHome(),
      ]);
      if (!active) return;
      if (connRes.status === "fulfilled") setConnections(connRes.value || []);
      if (learningRes.status === "fulfilled") setLearning(learningRes.value);
      if (homeRes.status === "fulfilled") setLearnHome(homeRes.value);
      setDataLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);

  if (isMobile) {
    return (
      <MobileHome
        profile={profile} user={user}
        connections={connections} learning={learning} learnHome={learnHome}
        loading={dataLoading} navigate={navigate}
        onOpenMenu={() => window.dispatchEvent(new CustomEvent("peerup:open-nav"))}
      />
    );
  }

  return (
    <DesktopHome
      profile={profile} user={user}
      connections={connections} learning={learning}
      loading={dataLoading}
    />
  );
}

// ── Inline SVG icons (mobile dashboard only) ────────────────────────────────

function HamburgerSvg() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}
function BellSvg() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
function DiscoverSvg() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function ChatSvg() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function RoomSvg() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function LearnSvg() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}
function TutorialSvg() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
    </svg>
  );
}
function UploadSvg() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  );
}
function PlaySvg() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}
function StarSvg() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
