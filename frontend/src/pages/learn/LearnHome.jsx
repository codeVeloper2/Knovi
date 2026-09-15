import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import * as api from "../../api";
import { SUBJECTS } from "../../subjects";
import NotificationsBell from "../../components/NotificationsPanel";

// ── Colour map ────────────────────────────────────────────────────────────
const COLORS = {
  Mathematics:"#6366f1",Math:"#6366f1",English:"#3b82f6",Biology:"#22c55e",
  Chemistry:"#f59e0b",Physics:"#eab308",History:"#a78bfa",Geography:"#34d399",
  "Computer Science":"#06b6d4",Spanish:"#ef4444",French:"#60a5fa",Art:"#f472b6",
  Music:"#818cf8",Economics:"#f59e0b",Literature:"#a78bfa",Psychology:"#34d399",
  Programming:"#06b6d4","Further Math":"#6366f1",Accounting:"#f59e0b",
};
const color = s => COLORS[s] || "#6366f1";

// ── Mobile header ─────────────────────────────────────────────────────────
function MobileHeader() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const name    = profile?.displayName || user?.displayName || "";
  const photo   = profile?.photoURL    || user?.photoURL    || "";
  const initial = name.trim()[0]?.toUpperCase() || "?";
  return (
    <div className="ln-mob-header">
      <div className="ln-mob-header-left">
        <button className="ln-mob-menu-btn" aria-label="Open menu"
          onClick={() => window.dispatchEvent(new CustomEvent("peerup:open-nav"))}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <span className="ln-mob-logo">Peer<span className="ln-mob-accent">Up</span></span>
      </div>
      <div className="ln-mob-header-right">
        <NotificationsBell className="notif-bell-btn" />
        <button className="ln-mob-avatar" onClick={() => navigate("/app/settings")} aria-label="Profile">
          {photo ? <img src={photo} alt={name} referrerPolicy="no-referrer" /> : <span>{initial}</span>}
        </button>
      </div>
    </div>
  );
}

// ── Tutorial card ─────────────────────────────────────────────────────────
function TutCard({ t, onClick }) {
  const c = color(t.subject);
  const dur = t.durationSeconds > 0
    ? `${Math.floor(t.durationSeconds / 60)}:${String(t.durationSeconds % 60).padStart(2, "0")}`
    : null;
  return (
    <button type="button" className="ln-card" onClick={onClick}>
      <div className="ln-card-thumb">
        {t.thumbnailUrl
          ? <img src={t.thumbnailUrl} alt={t.title} />
          : <div className="ln-card-thumb-empty" style={{ background: `${c}18` }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill={c} opacity=".4"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </div>
        }
        <div className="play-overlay">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="white" opacity=".9"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
        {dur && <span className="ln-card-dur">{dur}</span>}
        {t.progressPct > 0 && !t.completed && (
          <div className="ln-card-bar"><div style={{ width: `${t.progressPct}%`, background: c }} /></div>
        )}
      </div>
      <div className="ln-card-body">
        <span className="ln-card-subject" style={{ color: c }}>{t.subject}</span>
        <p className="ln-card-title">{t.title}</p>
        <span className="ln-card-meta">
          {t.views > 0 ? `${t.views} views` : ""}
          {t.views > 0 && t.rating > 0 ? " · " : ""}
          {t.rating > 0 ? `⭐ ${t.rating}` : ""}
        </span>
        <span className="ln-card-creator">{t.creatorName}</span>
      </div>
    </button>
  );
}

// ── Continue watching card ────────────────────────────────────────────────
function ContinueCard({ item, onClick }) {
  const c = color(item.subject);
  return (
    <button type="button" className="ln-continue-card" onClick={onClick}>
      <div className="ln-continue-thumb">
        {item.thumbnailUrl
          ? <img src={item.thumbnailUrl} alt={item.title} />
          : <div className="ln-card-thumb-empty" style={{ background: `${c}18`, height: "100%" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill={c} opacity=".5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </div>
        }
        <span className="ln-continue-subject-badge">{item.subject}</span>
        <div className="ln-continue-play">
          <div style={{ width:36, height:36, borderRadius:"50%", background:"rgba(255,255,255,0.18)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
        </div>
      </div>
      <div className="ln-continue-body">
        <div className="ln-continue-title">{item.title}</div>
        <div className="ln-continue-creator">{item.creatorName || ""}</div>
        <div className="ln-continue-bar-row">
          <div className="ln-continue-bar">
            <div className="ln-continue-fill" style={{ width:`${item.percentage}%`, background:c }} />
          </div>
          <span className="ln-continue-pct" style={{ color:c }}>{item.percentage}%</span>
        </div>
        <button type="button" className="ln-continue-resume" style={{ background:c }}>Resume</button>
      </div>
    </button>
  );
}

// ── Featured card ─────────────────────────────────────────────────────────
function FeatureCard({ t, onClick }) {
  const c = color(t.subject);
  const dur = t.durationSeconds > 0
    ? `${Math.floor(t.durationSeconds / 60)}:${String(t.durationSeconds % 60).padStart(2, "0")}`
    : null;
  return (
    <button type="button" className="ln-feature-card" onClick={onClick}>
      <div className="ln-feature-thumb">
        {t.thumbnailUrl
          ? <img src={t.thumbnailUrl} alt={t.title} />
          : <div className="ln-card-thumb-empty" style={{ background:`${c}18`, height:"100%" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill={c} opacity=".5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </div>
        }
        <span className="ln-feature-subject" style={{ background:c }}>{t.subject}</span>
        {dur && <span className="ln-feature-dur">{dur}</span>}
      </div>
      <div className="ln-feature-body">
        <div className="ln-feature-title">{t.title}</div>
        <div className="ln-feature-creator">{t.creatorName}</div>
      </div>
    </button>
  );
}

// ── Course card ───────────────────────────────────────────────────────────
function CourseCard({ subject, topicCount, navigate }) {
  const c = color(subject.name);
  return (
    <button
      type="button"
      className="ln-course-card"
      style={{ "--course-color": c }}
      onClick={() => navigate(`/app/solo?subject=${subject.id}`)}
    >
      <div className="ln-course-icon" style={{ background:`${c}20`, borderColor:`${c}40` }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
          <path d="M12 3 2 8l10 5 10-5-10-5z"/>
          <path d="M6 10.5V16c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5.5"/>
        </svg>
      </div>
      <div className="ln-course-body">
        <span className="ln-course-name">{subject.name}</span>
        {topicCount > 0 && (
          <span className="ln-course-meta">{topicCount} topic{topicCount !== 1 ? "s" : ""}</span>
        )}
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="ln-course-arrow">
        <path d="m9 6 6 6-6 6"/>
      </svg>
    </button>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────
function Sec({ title, onAll, children }) {
  return (
    <section className="ln-sec">
      <div className="ln-sec-head">
        <h2 className="ln-sec-title">{title}</h2>
        {onAll && <button type="button" className="ln-sec-all" onClick={onAll}>View all →</button>}
      </div>
      {children}
    </section>
  );
}

// ── Main export ───────────────────────────────────────────────────────────
export default function LearnHome() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [tab,            setTab]            = useState("tutorials");
  const [search,         setSearch]         = useState("");
  const [subject,        setSubject]        = useState("All");
  const [feed,           setFeed]           = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [subjects,       setSubjects]       = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [coursesLoaded,  setCoursesLoaded]  = useState(false);

  useEffect(() => {
    api.getLearnHome().then(setFeed).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab === "courses" && !coursesLoaded) {
      setCoursesLoading(true);
      api.soloGetSubjects()
        .then(data => setSubjects(Array.isArray(data) ? data : (data?.subjects || [])))
        .catch(() => {})
        .finally(() => { setCoursesLoading(false); setCoursesLoaded(true); });
    }
  }, [tab, coursesLoaded]);

  function handleSearch(e) {
    e.preventDefault();
    if (search.trim()) navigate(`/app/learn/tutorials?search=${encodeURIComponent(search.trim())}`);
  }
  function goTutorial(id) { navigate(`/app/learn/tutorials/${id}`); }

  const allTuts = [
    ...(feed?.latestTutorials || []),
    ...(feed?.popular || []),
  ].filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i);

  return (
    <div className="ln-page">
      <MobileHeader />

      {/* ── Page heading ── */}
      <div className="ln-page-head">
        <span className="ln-page-emoji">📖</span>
        <div>
          <h1 className="ln-page-title">Resources</h1>
          <p className="ln-page-sub">Learn something new. Share what you know.</p>
        </div>
      </div>

      {/* ── Tab switcher ── */}
      <div className="ln-tabs" role="tablist">
        <button
          type="button" role="tab"
          aria-selected={tab === "tutorials"}
          className={`ln-tab ${tab === "tutorials" ? "active" : ""}`}
          onClick={() => setTab("tutorials")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          Tutorials
        </button>
        <button
          type="button" role="tab"
          aria-selected={tab === "courses"}
          className={`ln-tab ${tab === "courses" ? "active" : ""}`}
          onClick={() => setTab("courses")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 3 2 8l10 5 10-5-10-5z"/>
            <path d="M6 10.5V16c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5.5"/>
          </svg>
          Courses
        </button>
      </div>

      {/* ════════ TUTORIALS TAB ════════ */}
      {tab === "tutorials" && (
        <>
          <form className="ln-search-wrap" onSubmit={handleSearch}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search tutorials, subjects, or topics..." />
          </form>

          <div className="ln-chips">
            {["All", ...SUBJECTS].map(s => (
              <button key={s} type="button"
                className={`ln-chip ${subject === s ? "selected" : ""}`}
                style={{ "--c": color(s) }}
                onClick={() => setSubject(s)}
              >{s}</button>
            ))}
          </div>

          {loading && <div className="ln-loading"><span className="discover-spinner" /> Loading...</div>}

          {!loading && feed && (
            <>
              {feed.continueWatching?.length > 0 && (
                <Sec title="Continue Learning" onAll={() => navigate("/app/learn/tutorials")}>
                  <div className="ln-continue-row">
                    {feed.continueWatching.map(item => (
                      <ContinueCard key={`${item.type}-${item.id}`} item={item}
                        onClick={() => navigate(`/app/learn/tutorials/${item.id}`)} />
                    ))}
                  </div>
                </Sec>
              )}

              {feed.latestTutorials?.length > 0 && (
                <Sec title="Featured Tutorials" onAll={() => navigate("/app/learn/tutorials")}>
                  <div className="ln-feature-row">
                    {feed.latestTutorials.slice(0, 6).map(t => (
                      <FeatureCard key={t.id} t={t} onClick={() => goTutorial(t.id)} />
                    ))}
                  </div>
                </Sec>
              )}

              {feed.popular?.length > 0 && (
                <Sec title="Popular Tutorials" onAll={() => navigate("/app/learn/tutorials")}>
                  <div className="ln-grid">
                    {(subject === "All"
                      ? feed.popular.slice(0, 4)
                      : feed.popular.filter(t => t.subject === subject).slice(0, 4)
                    ).map(t => (
                      <TutCard key={t.id} t={t} onClick={() => goTutorial(t.id)} />
                    ))}
                  </div>
                </Sec>
              )}

              {!feed.latestTutorials?.length && !feed.popular?.length && (
                <div className="ln-empty">
                  <span>🎓</span>
                  <h3>No tutorials yet</h3>
                  <p>Be the first to share your knowledge!</p>
                  <button type="button" className="ln-btn-primary" onClick={() => navigate("/app/learn/create")}>
                    Create Tutorial
                  </button>
                </div>
              )}

              <div className="ln-cta-banner">
                <div>
                  <h3>Share your knowledge</h3>
                  <p>Upload a tutorial and help fellow students learn.</p>
                </div>
                <button type="button" className="ln-btn-primary" onClick={() => navigate("/app/learn/create")}>
                  Create Tutorial
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* ════════ COURSES TAB ════════ */}
      {tab === "courses" && (
        <div className="ln-courses-wrap">
          {coursesLoading && (
            <div className="ln-loading"><span className="discover-spinner" /> Loading courses...</div>
          )}
          {!coursesLoading && coursesLoaded && subjects.length === 0 && (
            <div className="ln-empty">
              <span>📚</span>
              <h3>No courses yet</h3>
              <p>Check back soon — courses are being added.</p>
            </div>
          )}
          {!coursesLoading && subjects.length > 0 && (
            <>
              <p className="ln-courses-hint">Pick a subject to start learning at your own pace.</p>
              <div className="ln-courses-list">
                {subjects.map(s => (
                  <CourseCard key={s.id} subject={s}
                    topicCount={s.topicCount ?? s.topics_count ?? 0}
                    navigate={navigate} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
