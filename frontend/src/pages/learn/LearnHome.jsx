import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import * as api from "../../api";
import { SUBJECTS } from "../../subjects";

// ── per-subject accent colour ─────────────────────────────────────────────
const COLORS = {
  Math: "#6366f1", English: "#3b82f6", Biology: "#22c55e",
  Chemistry: "#f59e0b", Physics: "#eab308", History: "#a78bfa",
  Geography: "#34d399", "Computer Science": "#06b6d4", Spanish: "#ef4444",
  French: "#60a5fa", Art: "#f472b6", Music: "#818cf8",
  Economics: "#f59e0b", Literature: "#a78bfa", Psychology: "#34d399",
};
const color = s => COLORS[s] || "#6366f1";

function fmtDur(sec) {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

// ── small shared card ─────────────────────────────────────────────────────
function Card({ title, subject, meta, thumb, badge, progress, onClick }) {
  const c = color(subject);
  return (
    <button type="button" className="ln-card" onClick={onClick}>
      <div className="ln-card-thumb">
        {thumb
          ? <img src={thumb} alt={title} />
          : <div className="ln-card-thumb-empty" style={{ background: `${c}18` }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill={c} opacity=".5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </div>
        }
        {badge && <span className="ln-card-badge">{badge}</span>}
        {progress > 0 && (
          <div className="ln-card-bar"><div style={{ width: `${progress}%`, background: c }} /></div>
        )}
      </div>
      <div className="ln-card-body">
        <span className="ln-card-subject" style={{ color: c }}>{subject}</span>
        <p className="ln-card-title">{title}</p>
        {meta && <span className="ln-card-meta">{meta}</span>}
        {progress > 0 && <span className="ln-card-pct" style={{ color: c }}>{progress}%</span>}
      </div>
    </button>
  );
}

// ── continue-watching pill ────────────────────────────────────────────────
function ContinuePill({ item, onClick }) {
  const c = color(item.subject);
  return (
    <button type="button" className="ln-pill" onClick={onClick}>
      <div className="ln-pill-thumb">
        {item.thumbnailUrl
          ? <img src={item.thumbnailUrl} alt={item.title} />
          : <div className="ln-pill-thumb-empty" style={{ background: `${c}18` }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill={c}><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </div>
        }
        <div className="ln-pill-play">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
      </div>
      <div className="ln-pill-body">
        <p className="ln-pill-title">{item.title}</p>
        <div className="ln-pill-bar-row">
          <div className="ln-pill-track"><div className="ln-pill-fill" style={{ width: `${item.percentage}%`, background: c }} /></div>
          <span className="ln-pill-pct" style={{ color: c }}>{item.percentage}%</span>
        </div>
      </div>
    </button>
  );
}

// ── section wrapper ───────────────────────────────────────────────────────
function Sec({ title, onAll, children }) {
  return (
    <section className="ln-sec">
      <div className="ln-sec-head">
        <h2 className="ln-sec-title">{title}</h2>
        {onAll && <button type="button" className="ln-sec-all" onClick={onAll}>See all →</button>}
      </div>
      {children}
    </section>
  );
}

// ── main page ─────────────────────────────────────────────────────────────
export default function LearnHome() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [search,  setSearch]  = useState("");
  const [feed,    setFeed]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getLearnHome().then(setFeed).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const first = profile?.displayName?.split(" ")[0] || "there";

  function handleSearch(e) {
    e.preventDefault();
    if (search.trim()) navigate(`/app/learn/courses?search=${encodeURIComponent(search.trim())}`);
  }

  function goCourse(id)   { navigate(`/app/learn/courses/${id}`); }
  function goTutorial(id) { navigate(`/app/learn/tutorials/${id}`); }
  function goContinue(item) {
    if (item.type === "lesson") navigate(`/app/learn/courses/${item.courseId}/lessons/${item.id}`);
    else navigate(`/app/learn/tutorials/${item.id}`);
  }

  return (
    <div className="ln-page">

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="ln-hero">
        <div className="ln-hero-text">
          <p className="ln-hero-greet">Welcome back, {first} 👋</p>
          <h1 className="ln-hero-h1">Learn smarter,<br />together.</h1>
          <p className="ln-hero-sub">Courses, tutorials and study tools — all in one place.</p>

          <form className="ln-search" onSubmit={handleSearch}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search courses, topics or tutorials..."
            />
            <button type="submit">Search</button>
          </form>
        </div>

        {/* Quick nav tiles */}
        <div className="ln-tiles">
          {[
            { icon: "📚", label: "Courses",     path: "/app/learn/courses"     },
            { icon: "🎥", label: "Tutorials",   path: "/app/learn/tutorials"   },
            { icon: "📈", label: "My Learning", path: "/app/learn/my-learning" },
            { icon: "🔖", label: "Saved",       path: "/app/learn/saved"       },
            { icon: "➕", label: "Upload",      path: "/app/learn/create", accent: true },
          ].map(t => (
            <button
              key={t.label}
              type="button"
              className={`ln-tile ${t.accent ? "ln-tile--accent" : ""}`}
              onClick={() => navigate(t.path)}
            >
              <span className="ln-tile-icon">{t.icon}</span>
              <span className="ln-tile-label">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Subject chips ─────────────────────────────────────────── */}
      <div className="ln-chips">
        {SUBJECTS.map(s => (
          <button
            key={s}
            type="button"
            className="ln-chip"
            style={{ "--c": color(s) }}
            onClick={() => navigate(`/app/learn/courses?subject=${encodeURIComponent(s)}`)}
          >
            {s}
          </button>
        ))}
      </div>

      {loading && <div className="ln-loading"><span className="discover-spinner" /> Loading...</div>}

      {!loading && feed && (
        <>
          {/* Continue Watching */}
          {feed.continueWatching?.length > 0 && (
            <Sec title="Continue Watching">
              <div className="ln-pills-row">
                {feed.continueWatching.map(item => (
                  <ContinuePill key={`${item.type}-${item.id}`} item={item} onClick={() => goContinue(item)} />
                ))}
              </div>
            </Sec>
          )}

          {/* Recommended */}
          {feed.recommended?.length > 0 && (
            <Sec title="Recommended for You" onAll={() => navigate("/app/learn/courses")}>
              <div className="ln-grid">
                {feed.recommended.slice(0, 4).map(c => (
                  <Card
                    key={c.id}
                    title={c.title}
                    subject={c.subject}
                    thumb={c.thumbnailUrl}
                    meta={`${c.lessonsCount} lessons · ${c.durationMinutes} min${c.rating > 0 ? ` · ⭐ ${c.rating}` : ""}`}
                    progress={c.progressPct}
                    onClick={() => goCourse(c.id)}
                  />
                ))}
              </div>
            </Sec>
          )}

          {/* Popular Courses */}
          {feed.popular?.length > 0 && (
            <Sec title="Popular Courses" onAll={() => navigate("/app/learn/courses")}>
              <div className="ln-grid">
                {feed.popular.slice(0, 4).map(c => (
                  <Card
                    key={c.id}
                    title={c.title}
                    subject={c.subject}
                    thumb={c.thumbnailUrl}
                    meta={`${c.lessonsCount} lessons · ${c.durationMinutes} min${c.rating > 0 ? ` · ⭐ ${c.rating}` : ""}`}
                    progress={c.progressPct}
                    onClick={() => goCourse(c.id)}
                  />
                ))}
              </div>
            </Sec>
          )}

          {/* Student Tutorials */}
          {feed.latestTutorials?.length > 0 && (
            <Sec title="Student Tutorials" onAll={() => navigate("/app/learn/tutorials")}>
              <div className="ln-grid">
                {feed.latestTutorials.slice(0, 4).map(t => (
                  <Card
                    key={t.id}
                    title={t.title}
                    subject={t.subject}
                    thumb={t.thumbnailUrl}
                    badge={fmtDur(t.durationSeconds)}
                    meta={`${t.views > 0 ? `${t.views} views` : ""}${t.rating > 0 ? ` · ⭐ ${t.rating}` : ""}`}
                    progress={t.progressPct}
                    onClick={() => goTutorial(t.id)}
                  />
                ))}
              </div>
            </Sec>
          )}

          {/* Empty state */}
          {!feed.recommended?.length && !feed.popular?.length && !feed.latestTutorials?.length && (
            <div className="ln-empty">
              <span>🎓</span>
              <h3>No content yet</h3>
              <p>Be the first to upload a tutorial!</p>
              <button type="button" className="ln-btn-primary" onClick={() => navigate("/app/learn/create")}>
                Upload Tutorial
              </button>
            </div>
          )}

          {/* Creator CTA */}
          <div className="ln-cta-banner">
            <div>
              <h3>Share your knowledge</h3>
              <p>Upload a tutorial and help fellow students learn.</p>
            </div>
            <button type="button" className="ln-btn-primary" onClick={() => navigate("/app/learn/create")}>
              Become a Creator
            </button>
          </div>
        </>
      )}
    </div>
  );
}
